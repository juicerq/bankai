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
export type ReviewContent =
	| { status: "ready"; lines: DiffLine[] }
	| { status: "empty" }
	| { status: "binary" }
	| { status: "too-large"; lineCount?: number }
	| { status: "unavailable" };
export type FileChange = {
	path: string;
	status: FileStatus;
	additions: number;
	deletions: number;
	content: ReviewContent;
};
export type ReviewSnapshot = {
	isRepo: boolean;
	files: FileChange[];
	totals: { additions: number; deletions: number; files: number };
};
export type FullFile = ReviewContent;

export const Git = {
	snapshot: async (path: string, mode: ReviewMode): Promise<ReviewSnapshot> => {
		const inside = await isRepo(path);
		if (!inside) {
			return { isRepo: false, files: [], totals: { additions: 0, deletions: 0, files: 0 } };
		}

		const base = await resolveBase(path, mode);
		const [tracked, untracked] = await Promise.all([
			base ? diffFiles(path, base) : indexedFiles(path),
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

		const raw: unknown = await fullFileDiff(input).catch((err) => err);
		if (isGitOutputOverflow(raw)) {
			return { status: "too-large" };
		}
		if (typeof raw !== "string") {
			return { status: "unavailable" };
		}

		const file = parseDiff(raw)[0];
		if (!file || (file.status === "added" && file.content.status === "ready" && file.content.lines.length === 0)) {
			return { status: "empty" };
		}
		if (file.content.status === "ready" && file.content.lines.length > FULL_FILE_MAX_LINES) {
			return { status: "too-large", lineCount: file.content.lines.length };
		}

		return file.content;
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
	const addedPaths = await gitText(path, ["diff", base, "-M", "--no-ext-diff", "--name-only", "--diff-filter=A", "-z"])
		.then(nulSeparatedPaths);
	const additions = await Promise.all(addedPaths.map((file) => newFile(path, file, "added")));
	const exclusions = addedPaths.map((file) => `:(exclude,literal)${file}`);
	const raw = await gitText(path, [
		"diff",
		base,
		"-M",
		"--no-color",
		"--no-ext-diff",
		"--",
		...exclusions,
	]);

	return [...parseDiff(raw), ...additions];
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
			if (isNoIndexPatch(err)) {
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

function isNoIndexPatch(err: unknown): err is Error & { stdout: string } {
	return isNoIndexDifference(err) && err.stdout.includes("diff --git ");
}

function isGitOutputOverflow(err: unknown): boolean {
	if (!(err instanceof Error) || !("code" in err)) {
		return false;
	}

	return err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

async function indexedFiles(path: string): Promise<FileChange[]> {
	const files = await gitText(path, ["ls-files", "--cached", "-z"]).then(nulSeparatedPaths);
	return await Promise.all(files.map((file) => newFile(path, file, "added")));
}

async function untrackedFiles(path: string): Promise<FileChange[]> {
	const files = await gitText(path, ["ls-files", "--others", "--exclude-standard", "-z"]).then(nulSeparatedPaths);
	return await Promise.all(files.map((file) => newFile(path, file, "untracked")));
}

async function newFile(path: string, file: string, status: "added" | "untracked"): Promise<FileChange> {
	const raw: unknown = await noIndexDiff(path, file).catch((err) => err);
	if (isGitOutputOverflow(raw)) {
		const additions = await noIndexAdditions(path, file).catch(() => 0);
		return {
			path: file,
			status,
			additions,
			deletions: 0,
			content: { status: "too-large", ...(additions > 0 ? { lineCount: additions } : {}) },
		};
	}
	if (typeof raw !== "string") {
		return { path: file, status, additions: 0, deletions: 0, content: { status: "unavailable" } };
	}
	const parsed = parseDiff(raw)[0];
	if (!parsed) {
		return { path: file, status, additions: 0, deletions: 0, content: { status: "empty" } };
	}
	if (parsed.content.status === "ready" && parsed.content.lines.length === 0) {
		return { ...parsed, path: file, status, content: { status: "empty" } };
	}
	if (parsed.content.status === "ready" && parsed.content.lines.length > FULL_FILE_MAX_LINES) {
		return {
			...parsed,
			path: file,
			status,
			content: { status: "too-large", lineCount: parsed.content.lines.length },
		};
	}

	return { ...parsed, path: file, status };
}

async function noIndexDiff(path: string, file: string): Promise<string> {
	return await gitText(path, ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", NULL_FILE, file])
		.catch((err) => {
			if (isNoIndexPatch(err)) {
				return err.stdout;
			}

			throw err;
		});
}

async function noIndexAdditions(path: string, file: string): Promise<number> {
	const raw = await gitText(path, ["diff", "--no-index", "--no-ext-diff", "--numstat", "--", NULL_FILE, file])
		.catch((err) => {
			if (isNoIndexDifference(err)) {
				return err.stdout;
			}

			throw err;
		});
	const additions = raw.split("\t", 1)[0];
	return additions && additions !== "-" ? Number(additions) : 0;
}

function nulSeparatedPaths(raw: string): string[] {
	return raw.split("\0").filter(Boolean);
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
			current = {
				path: HEADER_PATH.exec(line)?.[1] ?? "",
				status: "modified",
				additions: 0,
				deletions: 0,
				content: { status: "ready", lines: [] },
			};
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
		if (line.startsWith("Binary files ")) {
			current.content = { status: "binary" };
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
		if (line.startsWith("+") && current.content.status === "ready") {
			current.content.lines.push({ kind: "add", number: nextNewLine, hunk, content: line.slice(1) });
			current.additions += 1;
			nextNewLine += 1;
			continue;
		}
		if (line.startsWith("-") && current.content.status === "ready") {
			current.content.lines.push({ kind: "remove", oldNumber: nextOldLine, hunk, content: line.slice(1) });
			current.deletions += 1;
			nextOldLine += 1;
			continue;
		}
		if (line.startsWith(" ") && current.content.status === "ready") {
			current.content.lines.push({
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
