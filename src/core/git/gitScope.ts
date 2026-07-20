import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { type FileChange, fileContentLines } from "@core/review/FileChange";

export type GitScope = "uncommitted" | "branch";

export type GitScopeResult = { status: "unavailable" } | { status: "ok"; files: FileChange[] };

const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const run = promisify(execFile);

async function git(dir: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
	try {
		const { stdout } = await run("git", args, { cwd: dir, maxBuffer: 1024 * 1024 * 64 });
		return { ok: true, stdout };
	} catch (err: any) {
		return { ok: false, stdout: typeof err.stdout === "string" ? err.stdout : "" };
	}
}

async function detectDefaultBranch(dir: string): Promise<string | null> {
	const remote = await git(dir, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
	if (remote.ok) {
		return remote.stdout.trim().replace("refs/remotes/", "");
	}

	for (const name of ["main", "master"]) {
		const local = await git(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
		if (local.ok) {
			return name;
		}
	}

	return null;
}

async function resolveBase(dir: string, scope: GitScope): Promise<string | null> {
	const repo = await git(dir, ["rev-parse", "--is-inside-work-tree"]);
	if (!repo.ok) {
		return null;
	}

	const head = await git(dir, ["rev-parse", "--verify", "--quiet", "HEAD"]);
	if (!head.ok) {
		return EMPTY_TREE_HASH;
	}
	if (scope === "uncommitted") {
		return "HEAD";
	}

	const defaultBranch = await detectDefaultBranch(dir);
	if (defaultBranch === null) {
		return null;
	}

	const mergeBase = await git(dir, ["merge-base", "HEAD", defaultBranch]);
	return mergeBase.ok ? mergeBase.stdout.trim() : null;
}

async function blobLines(dir: string, base: string, path: string): Promise<string[]> {
	const blob = await git(dir, ["show", `${base}:${path}`]);
	return blob.ok ? fileContentLines(blob.stdout) : [];
}

async function workingLines(dir: string, path: string): Promise<string[]> {
	const content = await readFile(join(dir, path), "utf8").catch(() => "");
	return fileContentLines(content);
}

function parseZ(stdout: string): string[] {
	return stdout.split("\0").filter((token) => token.length > 0);
}

async function trackedChanges(dir: string, base: string): Promise<FileChange[]> {
	const diff = await git(dir, ["diff", "--name-status", "--no-renames", "-z", base]);
	const tokens = parseZ(diff.stdout);

	const entries: { status: string; path: string }[] = [];
	for (let i = 0; i + 1 < tokens.length; i += 2) {
		const status = tokens[i];
		const path = tokens[i + 1];
		if (status === undefined || path === undefined) {
			continue;
		}
		entries.push({ status, path });
	}

	return await Promise.all(
		entries.map(async (entry) => ({
			path: entry.path,
			before: entry.status === "A" ? [] : await blobLines(dir, base, entry.path),
			after: entry.status === "D" ? [] : await workingLines(dir, entry.path),
		})),
	);
}

async function untrackedChanges(dir: string): Promise<FileChange[]> {
	const listed = await git(dir, ["ls-files", "--others", "--exclude-standard", "-z"]);

	return await Promise.all(
		parseZ(listed.stdout).map(async (path) => ({
			path,
			before: [],
			after: await workingLines(dir, path),
		})),
	);
}

export async function gitScopeChanges(input: { dir: string; scope: GitScope }): Promise<GitScopeResult> {
	const base = await resolveBase(input.dir, input.scope);
	if (base === null) {
		return { status: "unavailable" };
	}

	const [tracked, untracked] = await Promise.all([
		trackedChanges(input.dir, base),
		untrackedChanges(input.dir),
	]);

	const files = [...tracked, ...untracked].sort((left, right) => left.path.localeCompare(right.path));
	return { status: "ok", files };
}
