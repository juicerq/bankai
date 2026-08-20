import { createReadStream } from "node:fs";
import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { FileChange, ReviewSnapshot } from "@shared/review";
import { GitRun } from "@main/git/git-run";
import { ReviewBase, type ReviewScope } from "@main/git/review-base";
import { TurnBaseline, type Baseline, type BaselineFile } from "@main/git/review/turn-baseline";

const EMPTY_TOTALS = { additions: 0, deletions: 0, files: 0 };

async function snapshot(scope: ReviewScope): Promise<ReviewSnapshot> {
	const inside = await GitRun.isRepo(scope.path);
	if (!inside) {
		return { state: "not-a-repo", files: [], totals: EMPTY_TOTALS };
	}
	if (scope.mode === "last-turn") {
		return await turnSnapshot(scope.path, ReviewBase.turnBaseline(scope));
	}

	const base = await ReviewBase.commit(scope);
	const tracked = base ? await diffFiles(scope.path, base) : await indexedFiles(scope.path);
	const untracked = await untrackedFiles(scope.path);

	return readySnapshot([...tracked, ...untracked]);
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

async function turnSnapshot(path: string, baseline: Baseline | undefined): Promise<ReviewSnapshot> {
	if (!baseline) {
		return { state: "no-turn", files: [], totals: EMPTY_TOTALS };
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

	for (let offset = 0; offset < entries.length; offset += ReviewBase.CONCURRENCY) {
		const batch = entries.slice(offset, offset + ReviewBase.CONCURRENCY);
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

	if (input.before.kind !== "absent") {
		const stats = await lstat(target).catch(() => null);
		if (stats?.size === input.before.size && stats.mtimeMs === input.before.mtimeMs) {
			return undefined;
		}

		if (input.before.kind === "oversized") {
			return { path: input.file, status: turnStatus(input, !!stats, true), additions: 0, deletions: 0 };
		}
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

	for (let offset = 0; offset < files.length; offset += ReviewBase.CONCURRENCY) {
		const batch = files.slice(offset, offset + ReviewBase.CONCURRENCY);
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
			for (let index = buffer.indexOf(10); index !== -1; index = buffer.indexOf(10, index + 1)) {
				lines += 1;
			}
		}
	} catch {
		return 0;
	}

	return lines + (bytes > 0 && lastByte !== 10 ? 1 : 0);
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

export const ChangedFiles = {
	snapshot,
};
