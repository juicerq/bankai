import { createReadStream } from "node:fs";
import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { FileChange, ReviewScope, ReviewSnapshot } from "@main/git/contracts";
import { parseTrackedMetadata } from "@main/git/diffParse";
import {
	gitText,
	isNoIndexDifference,
	isRepo,
	NULL_FILE,
	nulSeparatedPaths,
} from "@main/git/run";
import { turnBaselines, withBaselineFile, type TurnBaseline, type TurnBaselineFile } from "@main/git/TurnBaseline";

const NEW_FILE_COUNT_CONCURRENCY = 16;

export async function snapshot(scope: ReviewScope): Promise<ReviewSnapshot> {
	const inside = await isRepo(scope.path);
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
}

export function turnBaseline(scope: ReviewScope): TurnBaseline | undefined {
	if (scope.mode !== "last-turn" || scope.shellId === undefined) {
		return undefined;
	}

	const baseline = turnBaselines.get(scope.shellId);
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

export async function resolveBase(scope: ReviewScope): Promise<string | null> {
	if (scope.mode === "last-turn") {
		return turnBaseline(scope)?.head ?? null;
	}

	const hasHead = await gitText(scope.path, ["rev-parse", "--verify", "--quiet", "HEAD"])
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

async function turnSnapshot(path: string, baseline: TurnBaseline | undefined): Promise<ReviewSnapshot> {
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
	baseline: TurnBaseline,
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
	before: TurnBaselineFile;
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
	const raw = await withBaselineFile(input.before, (base) =>
		gitText(input.root, [
			"diff",
			"--no-index",
			"--numstat",
			"--no-color",
			"--no-ext-diff",
			"--",
			base,
			input.present ? input.file : NULL_FILE,
		]).catch((err) => {
			if (isNoIndexDifference(err)) {
				return err.stdout;
			}

			throw err;
		}),
	);
	const [additions, deletions] = raw.split("\t");

	return { additions: Number(additions) || 0, deletions: Number(deletions) || 0 };
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
