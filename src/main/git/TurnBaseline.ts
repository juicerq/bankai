import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GIT_OUTPUT_MAX_BYTES, gitText, nulSeparatedPaths } from "@main/git/run";

const BASELINE_READ_CONCURRENCY = 16;

export type TurnBaselineFile =
	| { kind: "content"; content: Buffer }
	| { kind: "oversized"; size: number; mtimeMs: number }
	| { kind: "absent" };

export interface TurnBaseline {
	head: string | null;
	files: ReadonlyMap<string, TurnBaselineFile>;
}

export const turnBaselines = new Map<string, TurnBaseline>();
let workspace: Promise<string> | undefined;

export async function captureTurnBaseline({ path, shellId }: { path: string; shellId: string }): Promise<void> {
	const head = await gitText(path, ["rev-parse", "--verify", "--quiet", "HEAD"])
		.then((out) => out.trim())
		.catch(() => null);
	const tracked = head
		? await gitText(path, ["diff", head, "--name-only", "-z"]).then(nulSeparatedPaths)
		: await gitText(path, ["ls-files", "--cached", "-z"]).then(nulSeparatedPaths);
	const untracked = await gitText(path, ["ls-files", "--others", "--exclude-standard", "-z"])
		.then(nulSeparatedPaths);
	const dirty = [...new Set([...tracked, ...untracked])];

	const files = new Map<string, TurnBaselineFile>();
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

	turnBaselines.set(shellId, { head, files });
}

export async function withBaselineFile<T>(content: Buffer, read: (file: string) => Promise<T>): Promise<T> {
	workspace ??= mkdtemp(join(tmpdir(), "bankai-turn-"));
	const file = join(await workspace, randomUUID());
	await writeFile(file, content);

	try {
		return await read(file);
	} finally {
		await rm(file, { force: true });
	}
}

async function captureFile(path: string): Promise<TurnBaselineFile | undefined> {
	const stats = await lstat(path).catch(() => null);
	if (!stats) {
		return { kind: "absent" };
	}
	if (!stats.isFile()) {
		return undefined;
	}
	if (stats.size > GIT_OUTPUT_MAX_BYTES) {
		return { kind: "oversized", size: stats.size, mtimeMs: stats.mtimeMs };
	}

	const content = await readFile(path).catch(() => null);
	if (!content) {
		return undefined;
	}

	return { kind: "content", content };
}
