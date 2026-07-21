import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type } from "arktype";

const run = promisify(execFile);

const MAX_BUFFER = 10 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const FULL_FILE_MAX_LINES = 3000;

export const reviewModeSchema = type("'uncommitted' | 'branch'");
export type ReviewMode = typeof reviewModeSchema.infer;

type DiffLineKind = "context" | "add" | "remove";
export type DiffLine = { kind: DiffLineKind; number?: number; content: string };
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
export type FullFile = { status: "ready"; lines: DiffLine[] } | { status: "too-large"; lineCount: number };

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
		const lines = parseDiff(await fullFileDiff(input))[0]?.lines ?? [];

		if (lines.length > FULL_FILE_MAX_LINES) {
			return { status: "too-large", lineCount: lines.length };
		}

		return { status: "ready", lines };
	},
};

async function gitText(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await run("git", args, {
		cwd,
		maxBuffer: MAX_BUFFER,
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
	const tracked = await gitText(input.path, ["ls-files", "--", `:(literal)${input.file}`]).then((out) => !!out.trim());
	if (!tracked) {
		return await gitText(input.path, ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", "/dev/null", input.file])
			.catch((err: { stdout?: string }) => {
				if (err.stdout) {
					return err.stdout;
				}
				throw err;
			});
	}

	const base = await resolveBase(input.path, input.mode);
	if (!base) {
		throw new Error("Repository has no commits");
	}

	return await gitText(input.path, [
		"diff",
		base,
		"-M",
		"--no-color",
		"--no-ext-diff",
		"-U100000",
		"--",
		`:(literal)${input.file}`,
	]);
}

async function untrackedFiles(path: string): Promise<FileChange[]> {
	const raw = await gitText(path, ["ls-files", "--others", "--exclude-standard", "-z"]);
	return raw
		.split("\0")
		.filter(Boolean)
		.map((file) => ({ path: file, status: "untracked" as const, additions: 0, deletions: 0, lines: [] }));
}

const HEADER_PATH = /^diff --git a\/.+ b\/(.+)$/;
const HUNK_START = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseDiff(raw: string): FileChange[] {
	const files: FileChange[] = [];
	let current: FileChange | undefined;
	let nextLine = 0;

	for (const line of raw.split("\n")) {
		if (line.startsWith("diff --git ")) {
			current = { path: HEADER_PATH.exec(line)?.[1] ?? "", status: "modified", additions: 0, deletions: 0, lines: [] };
			files.push(current);
			nextLine = 0;
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
		const hunk = HUNK_START.exec(line);
		if (hunk?.[1]) {
			nextLine = Number(hunk[1]);
			continue;
		}
		if (line.startsWith("+")) {
			current.lines.push({ kind: "add", number: nextLine, content: line.slice(1) });
			current.additions += 1;
			nextLine += 1;
			continue;
		}
		if (line.startsWith("-")) {
			current.lines.push({ kind: "remove", content: line.slice(1) });
			current.deletions += 1;
			continue;
		}
		if (line.startsWith(" ")) {
			current.lines.push({ kind: "context", number: nextLine, content: line.slice(1) });
			nextLine += 1;
		}
	}

	return files;
}
