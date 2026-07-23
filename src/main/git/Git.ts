import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readlink, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
	FileChange,
	FullFile,
	ReviewContent,
	ReviewFiles,
	ReviewMode,
	ReviewSnapshot,
} from "@main/git/contracts";

const run = promisify(execFile);

export const GIT_OUTPUT_MAX_BYTES = 10 * 1024 * 1024;
const GIT_TIMEOUT_MS = 5000;
export const FULL_FILE_MAX_LINES = 3000;
const NEW_FILE_COUNT_CONCURRENCY = 16;
const NULL_FILE = process.platform === "win32" ? "NUL" : "/dev/null";

export const Git = {
	snapshot: async (path: string, mode: ReviewMode): Promise<ReviewSnapshot> => {
		const inside = await isRepo(path);
		if (!inside) {
			return { isRepo: false, files: [], totals: { additions: 0, deletions: 0, files: 0 } };
		}

		const base = await resolveBase(path, mode);
		const tracked = base ? await diffFiles(path, base) : await indexedFiles(path);
		const untracked = await untrackedFiles(path);
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

	files: async (input: { path: string; files: string[]; mode: ReviewMode }): Promise<ReviewFiles> => {
		await Promise.all(input.files.map((file) => assertFileWithinRepo(input.path, file)));

		const base = await resolveBase(input.path, input.mode);
		const raw: unknown = base
			? await gitText(input.path, ["diff", base, "-M", "--no-color", "--no-ext-diff"]).catch((err) => err)
			: "";
		if (typeof raw !== "string" || isGitOutputOverflow(raw)) {
			return await readFilesIndividually(input);
		}

		const parsedByPath = new Map(parseDiff(raw).map((file) => [file.path, compactContent(file)]));
		const files: ReviewFiles["files"] = [];
		const missing: { path: string; index: number }[] = [];
		for (const path of input.files) {
			const content = parsedByPath.get(path);
			files.push({ path, content: content ?? { status: "unavailable" } });
			if (!content) {
				missing.push({ path, index: files.length - 1 });
			}
		}

		for (let offset = 0; offset < missing.length; offset += NEW_FILE_COUNT_CONCURRENCY) {
			const batch = missing.slice(offset, offset + NEW_FILE_COUNT_CONCURRENCY);
			const contents = await Promise.all(
				batch.map(({ path: file }) => readFileDiff({ path: input.path, file, mode: input.mode }, false)),
			);
			for (const [index, item] of batch.entries()) {
				const result = files[item.index];
				if (result) {
					result.content = contents[index] ?? { status: "unavailable" };
				}
			}
		}

		return { files };
	},

	file: async (input: { path: string; file: string; mode: ReviewMode }): Promise<ReviewContent> => {
		return await readFileDiff(input, false);
	},

	fullFile: async (input: { path: string; file: string; mode: ReviewMode }): Promise<FullFile> => {
		return await readFileDiff(input, true);
	},
};

async function gitText(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await run("git", args, {
		cwd,
		maxBuffer: GIT_OUTPUT_MAX_BYTES,
		timeout: GIT_TIMEOUT_MS,
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
	const raw = await gitText(path, ["diff", base, "-M", "--raw", "--numstat", "-z", "--no-ext-diff"]);
	return parseTrackedMetadata(raw);
}

async function indexedFiles(path: string): Promise<FileChange[]> {
	const files = await gitText(path, ["ls-files", "--cached", "-z"]).then(nulSeparatedPaths);
	return await addedFileMetadata(path, files, "added");
}

async function untrackedFiles(path: string): Promise<FileChange[]> {
	const files = await gitText(path, ["ls-files", "--others", "--exclude-standard", "-z"]).then(nulSeparatedPaths);
	return await addedFileMetadata(path, files, "untracked");
}

async function addedFileMetadata(
	path: string,
	files: string[],
	status: "added" | "untracked",
): Promise<FileChange[]> {
	const changes: FileChange[] = [];

	for (let offset = 0; offset < files.length; offset += NEW_FILE_COUNT_CONCURRENCY) {
		const batch = files.slice(offset, offset + NEW_FILE_COUNT_CONCURRENCY);
		const counts = await Promise.all(batch.map((file) => countAddedLines(resolve(path, file))));
		changes.push(
			...batch.map((file, index) => ({
				path: file,
				status,
				additions: counts[index] ?? 0,
				deletions: 0,
			})),
		);
	}

	return changes;
}

async function countAddedLines(path: string): Promise<number> {
	const stats = await lstat(path).catch(() => null);
	if (!stats) {
		return 0;
	}
	if (stats.isSymbolicLink()) {
		return await readlink(path).then((target) => (target.length > 0 ? 1 : 0)).catch(() => 0);
	}
	if (!stats.isFile()) {
		return 0;
	}

	let bytes = 0;
	let lines = 0;
	let lastByte = 0;

	try {
		for await (const chunk of createReadStream(path)) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			if (buffer.includes(0)) {
				return 0;
			}
			bytes += buffer.length;
			lastByte = buffer.at(-1) ?? lastByte;
			for (const byte of buffer) {
				if (byte === 10) {
					lines += 1;
				}
			}
		}
	} catch {
		return 0;
	}

	return lines + (bytes > 0 && lastByte !== 10 ? 1 : 0);
}

async function readFilesIndividually(input: {
	path: string;
	files: string[];
	mode: ReviewMode;
}): Promise<ReviewFiles> {
	const files: ReviewFiles["files"] = [];
	for (let offset = 0; offset < input.files.length; offset += NEW_FILE_COUNT_CONCURRENCY) {
		const batch = input.files.slice(offset, offset + NEW_FILE_COUNT_CONCURRENCY);
		const contents = await Promise.all(
			batch.map((file) => readFileDiff({ path: input.path, file, mode: input.mode }, false)),
		);
		files.push(...batch.map((path, index) => ({ path, content: contents[index] ?? { status: "unavailable" } })));
	}

	return { files };
}

async function readFileDiff(
	input: { path: string; file: string; mode: ReviewMode },
	full: boolean,
): Promise<ReviewContent> {
	await assertFileWithinRepo(input.path, input.file);

	const raw: unknown = await fileDiff(input, full).catch((err) => err);
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
	if (
		file.content.status === "ready" &&
		(full || file.status === "added") &&
		file.content.lines.length > FULL_FILE_MAX_LINES
	) {
		return { status: "too-large", lineCount: file.content.lines.length };
	}

	return file.content;
}

async function fileDiff(
	input: { path: string; file: string; mode: ReviewMode },
	full: boolean,
): Promise<string> {
	const base = await resolveBase(input.path, input.mode);
	if (base) {
		const tracked = await gitText(input.path, [
			"diff",
			base,
			"-M",
			"--no-color",
			"--no-ext-diff",
			...(full ? ["-U100000"] : []),
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

function nulSeparatedPaths(raw: string): string[] {
	return raw.split("\0").filter(Boolean);
}

function parseTrackedMetadata(raw: string): FileChange[] {
	const tokens = raw.split("\0");
	const files: FileChange[] = [];
	let index = 0;

	while (tokens[index]?.startsWith(":")) {
		const header = tokens[index] ?? "";
		const statusCode = / ([A-Z])\d*$/.exec(header)?.[1];
		const renamed = statusCode === "R";
		const path = tokens[index + (renamed ? 2 : 1)];
		if (path) {
			files.push({
				path,
				status:
					statusCode === "A"
						? "added"
						: statusCode === "D"
							? "deleted"
							: renamed
								? "renamed"
								: "modified",
				additions: 0,
				deletions: 0,
			});
		}
		index += renamed ? 3 : 2;
	}

	const byPath = new Map(files.map((file) => [file.path, file]));
	while (index < tokens.length) {
		const record = tokens[index] ?? "";
		const [additions, deletions, path] = record.split("\t");
		const renamed = path === "";
		const finalPath = renamed ? tokens[index + 2] : path;
		const file = finalPath ? byPath.get(finalPath) : undefined;
		if (file) {
			file.additions = additions && additions !== "-" ? Number(additions) : 0;
			file.deletions = deletions && deletions !== "-" ? Number(deletions) : 0;
		}
		index += renamed ? 3 : 1;
	}

	return files;
}

interface ParsedFile extends FileChange {
	content: ReviewContent;
}

function compactContent(file: ParsedFile): ReviewContent {
	if (file.status === "added" && file.content.status === "ready" && file.content.lines.length === 0) {
		return { status: "empty" };
	}
	if (file.status === "added" && file.content.status === "ready" && file.content.lines.length > FULL_FILE_MAX_LINES) {
		return { status: "too-large", lineCount: file.content.lines.length };
	}

	return file.content;
}

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseDiff(raw: string): ParsedFile[] {
	const files: ParsedFile[] = [];
	let current: ParsedFile | undefined;
	let nextOldLine = 0;
	let nextNewLine = 0;
	let hunk = 0;

	for (const line of raw.split("\n")) {
		if (line.startsWith("diff --git ")) {
			current = {
				path: "",
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
