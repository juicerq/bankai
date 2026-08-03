import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
	FileChange,
	FullFile,
	ReviewContent,
	ReviewFiles,
} from "@main/git/git-contracts";
import { GitRun } from "@main/git/git-run";
import { ReviewBase, type ReviewScope } from "@main/git/review-base";
import { TurnBaseline } from "@main/git/review/turn-baseline";

const FULL_FILE_MAX_LINES = 3000;

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

interface ParsedFile extends FileChange {
	content: ReviewContent;
}

async function many(input: ReviewScope & { files: string[] }): Promise<ReviewFiles> {
	await Promise.all(input.files.map((file) => assertFileWithinRepo(input.path, file)));

	const base = await ReviewBase.commit(input);
	const raw: unknown = base
		? await GitRun.text(input.path, ["diff", base, "-M", "--no-color", "--no-ext-diff"]).catch((err) => err)
		: "";
	if (typeof raw !== "string" || GitRun.isGitOutputOverflow(raw)) {
		return await readFilesIndividually(input);
	}

	const baseline = ReviewBase.turnBaseline(input);
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

	for (let offset = 0; offset < missing.length; offset += ReviewBase.CONCURRENCY) {
		const batch = missing.slice(offset, offset + ReviewBase.CONCURRENCY);
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

async function one(input: ReviewScope & { file: string }): Promise<ReviewContent> {
	return await readFileDiff({ scope: input, file: input.file, full: false });
}

async function full(input: ReviewScope & { file: string }): Promise<FullFile> {
	return await readFileDiff({ scope: input, file: input.file, full: true });
}

async function readFilesIndividually(input: ReviewScope & { files: string[] }): Promise<ReviewFiles> {
	const files: ReviewFiles["files"] = [];
	for (let offset = 0; offset < input.files.length; offset += ReviewBase.CONCURRENCY) {
		const batch = input.files.slice(offset, offset + ReviewBase.CONCURRENCY);
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
	if (ReviewBase.turnBaseline(scope)?.files.get(file)?.kind === "oversized") {
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
	const before = ReviewBase.turnBaseline(scope)?.files.get(file);
	if (before?.kind === "content") {
		return await turnPatch({ root: scope.path, file, before: before.content, full });
	}
	if (before?.kind === "absent") {
		return await newFilePatch(scope.path, file);
	}

	const base = await ReviewBase.commit(scope);
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

function compactContent(file: ParsedFile): ReviewContent {
	if (file.status === "added" && file.content.status === "ready" && file.content.lines.length === 0) {
		return { status: "empty" };
	}
	if (file.status === "added" && file.content.status === "ready" && file.content.lines.length > FULL_FILE_MAX_LINES) {
		return { status: "too-large", lineCount: file.content.lines.length };
	}

	return file.content;
}

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

export const FileDiff = {
	FULL_FILE_MAX_LINES,
	many,
	one,
	full,
};
