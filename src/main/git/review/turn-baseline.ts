import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GitRun } from "@main/git/git-run";

const BASELINE_READ_CONCURRENCY = 16;

export type BaselineFile =
	| { kind: "content"; content: Buffer; size: number; mtimeMs: number }
	| { kind: "oversized"; size: number; mtimeMs: number }
	| { kind: "absent" };

export interface Baseline {
	path: string;
	head: string | null;
	files: ReadonlyMap<string, BaselineFile>;
}

const turnBaselines = new Map<string, Baseline>();
let workspace: Promise<string> | undefined;

async function captureTurnBaseline({ path, shellId }: { path: string; shellId: string }): Promise<void> {
	if (!await GitRun.isRepo(path)) {
		return;
	}

	const head = await GitRun.text(path, ["rev-parse", "--verify", "--quiet", "HEAD"])
		.then((out) => out.trim())
		.catch(() => null);
	const tracked = head
		? await GitRun.text(path, ["diff", head, "--name-only", "-z"]).then(GitRun.nulPaths)
		: await GitRun.text(path, ["ls-files", "--cached", "-z"]).then(GitRun.nulPaths);
	const untracked = await GitRun.text(path, ["ls-files", "--others", "--exclude-standard", "-z"])
		.then(GitRun.nulPaths);
	const dirty = [...new Set([...tracked, ...untracked])];

	const files = new Map<string, BaselineFile>();
	for (let offset = 0; offset < dirty.length; offset += BASELINE_READ_CONCURRENCY) {
		const batch = dirty.slice(offset, offset + BASELINE_READ_CONCURRENCY);
		const captured = await Promise.all(batch.map((file) => captureFile(resolve(path, file))));
		for (const [index, file] of batch.entries()) {
			const before = captured[index];
			if (before) {
				files.set(file, before);
			}
		}
	}

	turnBaselines.set(shellId, { path: resolve(path), head, files });
}

async function withBaselineFile<T>(content: Buffer, read: (file: string) => Promise<T>): Promise<T> {
	workspace ??= mkdtemp(join(tmpdir(), "bankai-turn-"));
	const file = join(await workspace, randomUUID());
	await writeFile(file, content);

	try {
		return await read(file);
	} finally {
		await rm(file, { force: true });
	}
}

async function captureFile(path: string): Promise<BaselineFile | undefined> {
	const stats = await lstat(path).catch(() => null);
	if (!stats) {
		return { kind: "absent" };
	}
	if (!stats.isFile()) {
		return undefined;
	}
	if (stats.size > GitRun.GIT_OUTPUT_MAX_BYTES) {
		return { kind: "oversized", size: stats.size, mtimeMs: stats.mtimeMs };
	}

	const content = await readFile(path).catch(() => null);
	if (!content) {
		return undefined;
	}

	return { kind: "content", content, size: stats.size, mtimeMs: stats.mtimeMs };
}

export const TurnBaseline = {
	byShell: turnBaselines,
	capture: captureTurnBaseline,
	withFile: withBaselineFile,
};
