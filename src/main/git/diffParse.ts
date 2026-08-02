import type { FileChange, ReviewContent } from "@main/git/contracts";

export const FULL_FILE_MAX_LINES = 3000;

const HUNK_START = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

interface ParsedFile extends FileChange {
	content: ReviewContent;
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

export function parseTrackedMetadata(raw: string): FileChange[] {
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

export function parseDiff(raw: string): ParsedFile[] {
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

export function compactContent(file: ParsedFile): ReviewContent {
	if (file.status === "added" && file.content.status === "ready" && file.content.lines.length === 0) {
		return { status: "empty" };
	}
	if (file.status === "added" && file.content.status === "ready" && file.content.lines.length > FULL_FILE_MAX_LINES) {
		return { status: "too-large", lineCount: file.content.lines.length };
	}

	return file.content;
}

export type { ParsedFile };
