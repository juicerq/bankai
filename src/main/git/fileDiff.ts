import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ReviewContent, ReviewFiles, ReviewScope } from "@main/git/contracts";
import { FULL_FILE_MAX_LINES, compactContent, parseDiff } from "@main/git/diffParse";
import { resolveBase, turnBaseline } from "@main/git/reviewSnapshot";
import {
	gitText,
	isGitOutputOverflow,
	isNoIndexPatch,
	NULL_FILE,
} from "@main/git/run";
import { withBaselineFile } from "@main/git/TurnBaseline";

const NEW_FILE_COUNT_CONCURRENCY = 16;

async function readFilesIndividually(input: ReviewScope & { files: string[] }): Promise<ReviewFiles> {
	const files: ReviewFiles["files"] = [];
	for (let offset = 0; offset < input.files.length; offset += NEW_FILE_COUNT_CONCURRENCY) {
		const batch = input.files.slice(offset, offset + NEW_FILE_COUNT_CONCURRENCY);
		const contents = await Promise.all(batch.map((file) => readFileDiff({ scope: input, file, full: false })));
		files.push(...batch.map((path, index) => ({ path, content: contents[index] ?? { status: "unavailable" } })));
	}

	return { files };
}

export async function readFileDiff({
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
	if (isGitOutputOverflow(raw)) {
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
		const tracked = await gitText(scope.path, [
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
	return await gitText(root, ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", NULL_FILE, file])
		.catch((err) => {
			if (isNoIndexPatch(err)) {
				return err.stdout;
			}

			throw err;
		});
}

async function turnPatch(input: { root: string; file: string; before: Buffer; full: boolean }): Promise<string> {
	const present = await lstat(resolve(input.root, input.file)).then((stats) => stats.isFile()).catch(() => false);

	return await withBaselineFile(input.before, (base) =>
		gitText(input.root, [
			"diff",
			"--no-index",
			"--no-color",
			"--no-ext-diff",
			...(input.full ? ["-U100000"] : []),
			"--",
			base,
			present ? input.file : NULL_FILE,
		]).catch((err) => {
			if (isNoIndexPatch(err)) {
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

export async function filesWithContent(input: ReviewScope & { files: string[] }): Promise<ReviewFiles> {
	await Promise.all(input.files.map((file) => assertFileWithinRepo(input.path, file)));

	const base = await resolveBase(input);
	const raw: unknown = base
		? await gitText(input.path, ["diff", base, "-M", "--no-color", "--no-ext-diff"]).catch((err) => err)
		: "";
	if (typeof raw !== "string" || isGitOutputOverflow(raw)) {
		return await readFilesIndividually(input);
	}

	const baseline = turnBaseline(input);
	const parsedByPath = new Map(
		parseDiff(raw)
			.filter((file) => !baseline?.files.has(file.path))
			.map((file) => [file.path, compactContent(file)] as const),
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
}
