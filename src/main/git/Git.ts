import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { type } from "arktype";

const run = promisify(execFile);

export const GIT_OUTPUT_MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 5000;
export const FULL_FILE_MAX_LINES = 3000;
const NULL_FILE = process.platform === "win32" ? "NUL" : "/dev/null";

export const reviewModeSchema = type("'uncommitted' | 'branch'");
export type ReviewMode = typeof reviewModeSchema.infer;

type DiffLineKind = "context" | "add" | "remove";
export type DiffLine = {
	kind: DiffLineKind;
	number?: number;
	oldNumber?: number;
	hunk: number;
	content: string;
};
type FileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";
export type FileChange = {
	path: string;
	status: FileStatus;
	additions: number;
	deletions: number;
	lines: DiffLine[];
};
export type ReviewSnapshot = {
	isRepo: boolean;
	files: FileChange[];
	totals: { additions: number; deletions: number; files: number };
};
export type FullFile = { status: "ready"; lines: DiffLine[] } | { status: "too-large"; lineCount?: number };

export const Git = {
	snapshot: async (path: string, mode: ReviewMode): Promise<ReviewSnapshot> => {
		const inside = await isRepo(path);
		if (!inside) {
			return { isRepo: false, files: [], totals: { additions: 0, deletions: 0, files: 0 } };
		}

		const base = await resolveBase(path, mode);
		const [tracked, untracked] = await Promise.all([
			base ? diffFiles(path, base) : Promise.resolve<FileChange[]>([]),
			untrackedFiles(path),
		]);
		const files = [...tracked, ...untracked];

		return {
			isRepo: true,
			files,
			totals: {
				additions: files.reduce((sum, file) => sum + file.additions, 0),
				deletions: files.reduce((sum, file) => sum + file.deletions, 0),
				files: files.length,
			},
		};
	},

	fullFile: async (input: { path: string; file: string; mode: ReviewMode }): Promise<FullFile> => {
		await assertFileWithinRepo(input.path, input.file);

		const raw = await fullFileDiff(input).catch((err) => {
			if (isGitOutputOverflow(err)) {
				return null;
			}

			throw err;
		});
		if (raw === null) {
			return { status: "too-large" };
		}

		const lines = parseDiff(raw)[0]?.lines ?? [];

		if (lines.length > FULL_FILE_MAX_LINES) {
			return { status: "too-large", lineCount: lines.length };
		}

		return { status: "ready", lines };
	},
};

async function gitText(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await run("git", args, {
		cwd,
		maxBuffer: GIT_OUTPUT_MAX_BYTES,
		timeout: TIMEOUT_MS,
		windowsHide: true,
	});
	return stdout;
}

async function isRepo(path: string): Promise<boolean> {
	return await gitText(path, ["rev-parse", "--is-inside-work-tree"])
		.then((out) => out.trim() === "true")
		.catch(() => false);
}

async function resolveBase(path: string, mode: ReviewMode): Promise<string | null> {
	const hasHead = await gitText(path, ["rev-parse", "--verify", "--quiet", "HEAD"])
		.then(() => true)
		.catch(() => false);
	if (!hasHead) {
		return null;
	}
	if (mode === "uncommitted") {
		return "HEAD";
	}
	return await branchBase(path);
}

async function branchBase(path: string): Promise<string> {
	const origin = await gitText(path, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
		.then((out) => out.trim())
		.catch(() => null);

	for (const ref of [origin, "main", "master"]) {
		if (!ref) {
			continue;
		}
		const base = await gitText(path, ["merge-base", ref, "HEAD"])
			.then((out) => out.trim())
			.catch(() => null);
		if (base) {
			return base;
		}
	}

	return "HEAD";
}

async function diffFiles(path: string, base: string): Promise<FileChange[]> {
	return parseDiff(await gitText(path, ["diff", base, "-M", "--no-color", "--no-ext-diff"]));
}

async function fullFileDiff(input: { path: string; file: string; mode: ReviewMode }): Promise<string> {
	const base = await resolveBase(input.path, input.mode);
	if (base) {
		const tracked = await gitText(input.path, [
			"diff",
			base,
			"-M",
			"--no-color",
			"--no-ext-diff",
			"-U100000",
			"--",
			`:(literal)${input.file}`,
		]);
		if (tracked) {
			return tracked;
		}
	}

	return await gitText(input.path, ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", NULL_FILE, input.file])
		.catch((err) => {
			if (isNoIndexDifference(err)) {
				return err.stdout;
			}
			throw err;
		});
}

async function assertFileWithinRepo(root: string, file: string): Promise<void> {
	if (isAbsolute(file)) {
		throw new Error("File path must be relative to the repository root");
	}

	const fromRoot = relative(resolve(root), resolve(root, file));
	if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
		throw new Error("File path must stay within the repository root");
	}

	const resolvedFile = await realpath(resolve(root, file)).catch((err) => {
		if (err instanceof Error && "code" in err && err.code === "ENOENT") {
			return null;
		}

		throw err;
	});
	if (!resolvedFile) {
		return;
	}

	const fromResolvedRoot = relative(await realpath(root), resolvedFile);
	if (fromResolvedRoot === ".." || fromResolvedRoot.startsWith(`..${sep}`) || isAbsolute(fromResolvedRoot)) {
		throw new Error("File path must stay within the repository root");
	}
}

function isNoIndexDifference(err: unknown): err is Error & { stdout: string } {
	if (!(err instanceof Error)) {
		return false;
	}
	if (!("code" in err) || err.code !== 1) {
		return false;
	}
	if (!("killed" in err) || err.killed !== false) {
		return false;
	}
	if (!("signal" in err) || err.signal !== null) {
		return false;
	}

	return "stdout" in err && typeof err.stdout === "string";
}

function isGitOutputOverflow(err: unknown): boolean {
	if (!(err instanceof Error) || !("code" in err)) {
		return false;
	}

	return err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

async function untrackedFiles(path: string): Promise<FileChange[]> {
	const raw = await gitText(path, ["ls-files", "--others", "--exclude-standard", "-z"]);
	return raw
		.split("\0")
		.filter(Boolean)
		.map((file) => ({ path: file, status: "untracked" as const, additions: 0, deletions: 0, lines: [] }));
}

const HEADER_PATH = /^diff --git a\/.+ b\/(.+)$/;
const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseDiff(raw: string): FileChange[] {
	const files: FileChange[] = [];
	let current: FileChange | undefined;
	let nextOldLine = 0;
	let nextNewLine = 0;
	let hunk = 0;

	for (const line of raw.split("\n")) {
		if (line.startsWith("diff --git ")) {
			current = { path: HEADER_PATH.exec(line)?.[1] ?? "", status: "modified", additions: 0, deletions: 0, lines: [] };
			files.push(current);
			nextOldLine = 0;
			nextNewLine = 0;
			hunk = 0;
			continue;
		}
		if (!current) {
			continue;
		}
		if (line.startsWith("new file")) {
			current.status = "added";
			continue;
		}
		if (line.startsWith("deleted file")) {
			current.status = "deleted";
			continue;
		}
		if (line.startsWith("rename to ")) {
			current.status = "renamed";
			current.path = line.slice("rename to ".length);
			continue;
		}
		if (line.startsWith("+++ ")) {
			const target = line.slice(4);
			if (target !== "/dev/null") {
				current.path = target.replace(/^b\//, "");
			}
			continue;
		}
		if (line.startsWith("--- ")) {
			continue;
		}
		const hunkStart = HUNK_START.exec(line);
		if (hunkStart?.[1] && hunkStart[2]) {
			nextOldLine = Number(hunkStart[1]);
			nextNewLine = Number(hunkStart[2]);
			hunk += 1;
			continue;
		}
		if (line.startsWith("+")) {
			current.lines.push({ kind: "add", number: nextNewLine, hunk, content: line.slice(1) });
			current.additions += 1;
			nextNewLine += 1;
			continue;
		}
		if (line.startsWith("-")) {
			current.lines.push({ kind: "remove", oldNumber: nextOldLine, hunk, content: line.slice(1) });
			current.deletions += 1;
			nextOldLine += 1;
			continue;
		}
		if (line.startsWith(" ")) {
			current.lines.push({
				kind: "context",
				number: nextNewLine,
				oldNumber: nextOldLine,
				hunk,
				content: line.slice(1),
			});
			nextOldLine += 1;
			nextNewLine += 1;
		}
	}

	return files;
}
