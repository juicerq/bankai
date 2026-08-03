import { createReadStream } from "node:fs";
import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
	FileChange,
	FullFile,
	ReviewContent,
	ReviewFiles,
	ReviewMode,
	ReviewSnapshot,
} from "@main/git/git-contracts";
import { GitRun } from "@main/git/git-run";
import {
	TurnBaseline,
	type Baseline,
	type BaselineFile,
} from "@main/git/review/turn-baseline";

export const FULL_FILE_MAX_LINES = 3000;
const NEW_FILE_COUNT_CONCURRENCY = 16;

export interface ReviewScope {
	path: string;
	mode: ReviewMode;
	shellId?: string;
}

export const Git = {
	snapshot: async (scope: ReviewScope): Promise<ReviewSnapshot> => {
		const inside = await GitRun.isRepo(scope.path);
		if (!inside) {
			return { state: "not-a-repo", files: [], totals: { additions: 0, deletions: 0, files: 0 } };
		}
		if (scope.mode === "last-turn") {
			return await turnSnapshot(scope.path, turnBaseline(scope));
		}

		const base = await resolveBase(scope);
		const tracked = base ? await diffFiles(scope.path, base) : await indexedFiles(scope.path);
		const untracked = await untrackedFiles(scope.path);

		return readySnapshot([...tracked, ...untracked]);
	},

	files: async (input: ReviewScope & { files: string[] }): Promise<ReviewFiles> => {
		await Promise.all(input.files.map((file) => assertFileWithinRepo(input.path, file)));

		const base = await resolveBase(input);
		const raw: unknown = base
			? await GitRun.text(input.path, ["diff", base, "-M", "--no-color", "--no-ext-diff"]).catch((err) => err)
			: "";
		if (typeof raw !== "string" || GitRun.isGitOutputOverflow(raw)) {
			return await readFilesIndividually(input);
		}

		const baseline = turnBaseline(input);
		const parsedByPath = new Map(
			parseDiff(raw)
				.filter((file) => !baseline?.files.has(file.path))
				.map((file) => [file.path, compactContent(file)]),
		);
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
				batch.map(({ path: file }) => readFileDiff({ scope: input, file, full: false })),
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

	file: async (input: ReviewScope & { file: string }): Promise<ReviewContent> => {
		return await readFileDiff({ scope: input, file: input.file, full: false });
	},

	fullFile: async (input: ReviewScope & { file: string }): Promise<FullFile> => {
		return await readFileDiff({ scope: input, file: input.file, full: true });
	},
};

function turnBaseline(scope: ReviewScope): Baseline | undefined {
	if (scope.mode !== "last-turn" || scope.shellId === undefined) {
		return undefined;
	}

	const baseline = TurnBaseline.byShell.get(scope.shellId);
	if (baseline?.path !== resolve(scope.path)) {
		return undefined;
	}

	return baseline;
}

function readySnapshot(files: FileChange[]): ReviewSnapshot {
	return {
		state: "ready",
		files,
		totals: {
			additions: files.reduce((sum, file) => sum + file.additions, 0),
			deletions: files.reduce((sum, file) => sum + file.deletions, 0),
			files: files.length,
		},
	};
}

async function resolveBase(scope: ReviewScope): Promise<string | null> {
	if (scope.mode === "last-turn") {
		return turnBaseline(scope)?.head ?? null;
	}

	const hasHead = await GitRun.text(scope.path, ["rev-parse", "--verify", "--quiet", "HEAD"])
		.then(() => true)
		.catch(() => false);
	if (!hasHead) {
		return null;
	}
	if (scope.mode === "uncommitted") {
		return "HEAD";
	}

	return await branchBase(scope.path);
}

async function branchBase(path: string): Promise<string> {
	const origin = await GitRun.text(path, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
		.then((out) => out.trim())
		.catch(() => null);

	for (const ref of [origin, "main", "master"]) {
		if (!ref) {
			continue;
		}
		const base = await GitRun.text(path, ["merge-base", ref, "HEAD"])
			.then((out) => out.trim())
			.catch(() => null);
		if (base) {
			return base;
		}
	}

	return "HEAD";
}

async function turnSnapshot(path: string, baseline: Baseline | undefined): Promise<ReviewSnapshot> {
	if (!baseline) {
		return { state: "no-turn", files: [], totals: { additions: 0, deletions: 0, files: 0 } };
	}

	const tracked = baseline.head ? await diffFiles(path, baseline.head) : await indexedFiles(path);
	const untracked = await untrackedFiles(path);
	const untrackedNow = new Set(untracked.map((file) => file.path));
	const started = [...tracked, ...untracked].filter((file) => !baseline.files.has(file.path));
	const files = [...started, ...(await turnChanges(path, baseline, untrackedNow))];

	return readySnapshot(files.sort((left, right) => left.path.localeCompare(right.path)));
}

async function turnChanges(
	path: string,
	baseline: Baseline,
	untrackedNow: ReadonlySet<string>,
): Promise<FileChange[]> {
	const entries = [...baseline.files];
	const changes: FileChange[] = [];

	for (let offset = 0; offset < entries.length; offset += NEW_FILE_COUNT_CONCURRENCY) {
		const batch = entries.slice(offset, offset + NEW_FILE_COUNT_CONCURRENCY);
		const captured = await Promise.all(
			batch.map(([file, before]) => turnChange({ root: path, file, before, untrackedNow })),
		);
		changes.push(...captured.filter((change) => !!change));
	}

	return changes;
}

async function turnChange(input: {
	root: string;
	file: string;
	before: BaselineFile;
	untrackedNow: ReadonlySet<string>;
}): Promise<FileChange | undefined> {
	const target = resolve(input.root, input.file);

	if (input.before.kind === "oversized") {
		const stats = await lstat(target).catch(() => null);
		if (stats?.size === input.before.size && stats.mtimeMs === input.before.mtimeMs) {
			return undefined;
		}

		return { path: input.file, status: turnStatus(input, !!stats, true), additions: 0, deletions: 0 };
	}

	const current = await readFile(target).catch(() => null);
	if (input.before.kind === "absent") {
		if (!current) {
			return undefined;
		}

		return {
			path: input.file,
			status: turnStatus(input, true, false),
			additions: await countAddedLines(target),
			deletions: 0,
		};
	}
	if (current?.equals(input.before.content)) {
		return undefined;
	}

	return {
		path: input.file,
		status: turnStatus(input, !!current, true),
		...(await turnCounts({
			root: input.root,
			file: input.file,
			before: input.before.content,
			present: !!current,
		})),
	};
}

function turnStatus(
	input: { file: string; untrackedNow: ReadonlySet<string> },
	present: boolean,
	existed: boolean,
): FileChange["status"] {
	if (!present) {
		return "deleted";
	}
	if (input.untrackedNow.has(input.file)) {
		return "untracked";
	}
	if (!existed) {
		return "added";
	}

	return "modified";
}

async function turnCounts(input: {
	root: string;
	file: string;
	before: Buffer;
	present: boolean;
}): Promise<{ additions: number; deletions: number }> {
	const raw = await TurnBaseline.withFile(input.before, (base) =>
		GitRun.text(input.root, [
			"diff",
			"--no-index",
			"--numstat",
			"--no-color",
			"--no-ext-diff",
			"--",
			base,
			input.present ? input.file : GitRun.NULL_FILE,
		]).catch((err) => {
			if (GitRun.isNoIndexDifference(err)) {
				return err.stdout;
			}

			throw err;
		}),
	);
	const [additions, deletions] = raw.split("\t");

	return { additions: Number(additions) || 0, deletions: Number(deletions) || 0 };
}

async function diffFiles(path: string, base: string): Promise<FileChange[]> {
	const raw = await GitRun.text(path, ["diff", base, "-M", "--raw", "--numstat", "-z", "--no-ext-diff"]);
	return parseTrackedMetadata(raw);
}

async function indexedFiles(path: string): Promise<FileChange[]> {
	const files = await GitRun.text(path, ["ls-files", "--cached", "-z"]).then(GitRun.nulPaths);
	return await addedFileMetadata(path, files, "added");
}

async function untrackedFiles(path: string): Promise<FileChange[]> {
	const files = await GitRun.text(path, ["ls-files", "--others", "--exclude-standard", "-z"]).then(GitRun.nulPaths);
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

async function readFilesIndividually(input: ReviewScope & { files: string[] }): Promise<ReviewFiles> {
	const files: ReviewFiles["files"] = [];
	for (let offset = 0; offset < input.files.length; offset += NEW_FILE_COUNT_CONCURRENCY) {
		const batch = input.files.slice(offset, offset + NEW_FILE_COUNT_CONCURRENCY);
		const contents = await Promise.all(batch.map((file) => readFileDiff({ scope: input, file, full: false })));
		files.push(...batch.map((path, index) => ({ path, content: contents[index] ?? { status: "unavailable" } })));
	}

	return { files };
}

async function readFileDiff({
	scope,
	file,
	full,
}: {
	scope: ReviewScope;
	file: string;
	full: boolean;
}): Promise<ReviewContent> {
	await assertFileWithinRepo(scope.path, file);
	if (turnBaseline(scope)?.files.get(file)?.kind === "oversized") {
		return { status: "too-large" };
	}

	const raw: unknown = await fileDiff({ scope, file, full }).catch((err) => err);
	if (GitRun.isGitOutputOverflow(raw)) {
		return { status: "too-large" };
	}
	if (typeof raw !== "string") {
		return { status: "unavailable" };
	}

	const parsed = parseDiff(raw)[0];
	if (!parsed || (parsed.status === "added" && parsed.content.status === "ready" && parsed.content.lines.length === 0)) {
		return { status: "empty" };
	}
	if (
		parsed.content.status === "ready" &&
		(full || parsed.status === "added") &&
		parsed.content.lines.length > FULL_FILE_MAX_LINES
	) {
		return { status: "too-large", lineCount: parsed.content.lines.length };
	}

	return parsed.content;
}

async function fileDiff({ scope, file, full }: { scope: ReviewScope; file: string; full: boolean }): Promise<string> {
	const before = turnBaseline(scope)?.files.get(file);
	if (before?.kind === "content") {
		return await turnPatch({ root: scope.path, file, before: before.content, full });
	}
	if (before?.kind === "absent") {
		return await newFilePatch(scope.path, file);
	}

	const base = await resolveBase(scope);
	if (base) {
		const tracked = await GitRun.text(scope.path, [
			"diff",
			base,
			"-M",
			"--no-color",
			"--no-ext-diff",
			...(full ? ["-U100000"] : []),
			"--",
			`:(literal)${file}`,
		]);
		if (tracked) {
			return tracked;
		}
	}

	return await newFilePatch(scope.path, file);
}

async function newFilePatch(root: string, file: string): Promise<string> {
	return await GitRun.text(root, ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", GitRun.NULL_FILE, file])
		.catch((err) => {
			if (GitRun.isNoIndexPatch(err)) {
				return err.stdout;
			}

			throw err;
		});
}

async function turnPatch(input: { root: string; file: string; before: Buffer; full: boolean }): Promise<string> {
	const present = await lstat(resolve(input.root, input.file)).then((stats) => stats.isFile()).catch(() => false);

	return await TurnBaseline.withFile(input.before, (base) =>
		GitRun.text(input.root, [
			"diff",
			"--no-index",
			"--no-color",
			"--no-ext-diff",
			...(input.full ? ["-U100000"] : []),
			"--",
			base,
			present ? input.file : GitRun.NULL_FILE,
		]).catch((err) => {
			if (GitRun.isNoIndexPatch(err)) {
				return err.stdout;
			}

			throw err;
		}),
	);
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

function trackedStatus(statusCode: string | undefined, renamed: boolean): FileChange["status"] {
	if (statusCode === "A") {
		return "added";
	}

	if (statusCode === "D") {
		return "deleted";
	}

	if (renamed) {
		return "renamed";
	}

	return "modified";
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
				status: trackedStatus(statusCode, renamed),
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
