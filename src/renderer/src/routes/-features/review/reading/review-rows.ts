import type { DiffLine, FileChange, ReviewContent } from "@shared/review";
import { reviewContentNotice } from "@renderer/routes/-features/review/reading/review-notice";

export const REVIEW_ROW_HEIGHT = { file: 32, line: 20, notice: 40, gap: 20 } as const;
export const DIFF_GUTTER_WIDTH = 40;
export const DIFF_TAB_SIZE = 4;

const DIFF_MARKER_COLUMNS = 2;

export type ReviewRow =
	| { kind: "file"; key: string; file: FileChange; open: boolean; first: boolean }
	| { kind: "line"; key: string; path: string; line: DiffLine; lines: DiffLine[]; lineIndex: number }
	| { kind: "notice"; key: string; path: string; message: string }
	| { kind: "gap"; key: string; path: string; skipped: number };

export type ReviewFileRow = Extract<ReviewRow, { kind: "file" }>;

type LastLine = Partial<Pick<DiffLine, "hunk" | "number" | "oldNumber">>;

export interface ReadingPosition {
	rowKey: string;
	path: string;
	fileIndex: number;
	rowOffset: number;
	scrollLeft: number;
}

export function reviewRows({
	files,
	closedFiles,
	contentByPath,
}: {
	files: FileChange[];
	closedFiles: ReadonlySet<string>;
	contentByPath: ReadonlyMap<string, ReviewContent>;
}) {
	const rows: ReviewRow[] = [];
	const headers: number[] = [];
	let header = -1;

	function push(row: ReviewRow) {
		if (row.kind === "file") {
			header = rows.length;
		}

		rows.push(row);
		headers.push(header);
	}

	for (const file of files) {
		const open = !closedFiles.has(file.path);
		push({ kind: "file", key: `file:${file.path}`, file, open, first: rows.length === 0 });
		if (!open) {
			continue;
		}

		const content = contentByPath.get(file.path);
		if (content?.status !== "ready") {
			push({
				kind: "notice",
				key: `notice:${file.path}`,
				path: file.path,
				message: content ? reviewContentNotice({ content, full: false }) : "File unavailable.",
			});
			continue;
		}

		const last: LastLine = {};

		for (const [lineIndex, line] of content.lines.entries()) {
			const skipped = skippedLines(line, last);

			if (skipped > 0) {
				push({ kind: "gap", key: `gap:${file.path}:${line.hunk}`, path: file.path, skipped });
			}

			push({
				kind: "line",
				key: lineKey(file.path, line),
				path: file.path,
				line,
				lines: content.lines,
				lineIndex,
			});

			last.hunk = line.hunk;
			last.number = line.number ?? last.number;
			last.oldNumber = line.oldNumber ?? last.oldNumber;
		}
	}

	return { rows, headers: new Int32Array(headers) };
}

export function diffContentWidth(lines: readonly Pick<DiffLine, "content">[]): string {
	let widest = 0;

	for (const line of lines) {
		widest = Math.max(widest, lineColumns(line.content) + DIFF_MARKER_COLUMNS);
	}

	return `calc(${DIFF_GUTTER_WIDTH}px + ${widest}ch)`;
}

function lineColumns(content: string): number {
	let columns = 0;

	for (const character of content) {
		columns = character === "\t" ? columns + DIFF_TAB_SIZE - (columns % DIFF_TAB_SIZE) : columns + 1;
	}

	return columns;
}

function skippedLines(line: DiffLine, last: LastLine): number {
	if (last.hunk === undefined || last.hunk === line.hunk) {
		return 0;
	}
	if (line.number !== undefined && last.number !== undefined) {
		return line.number - last.number - 1;
	}
	if (line.oldNumber !== undefined && last.oldNumber !== undefined) {
		return line.oldNumber - last.oldNumber - 1;
	}

	return 0;
}

function lineKey(path: string, line: DiffLine): string {
	return `line:${path}:${line.hunk}:${line.oldNumber ?? ""}:${line.number ?? ""}:${line.kind}`;
}

export function readingOffset(
	position: ReadingPosition | null,
	rows: ReviewRow[],
	fileRowByPath: ReadonlyMap<string, number>,
	files: FileChange[],
): number {
	if (!position) {
		return 0;
	}

	const index = readingIndex(position, rows, fileRowByPath, files);
	if (index === undefined) {
		return 0;
	}

	const rowOffset = rows[index]?.key === position.rowKey ? position.rowOffset : 0;

	return rows.slice(0, index).reduce((offset, row) => offset + REVIEW_ROW_HEIGHT[row.kind], rowOffset);
}

function readingIndex(
	position: ReadingPosition,
	rows: ReviewRow[],
	fileRowByPath: ReadonlyMap<string, number>,
	files: FileChange[],
): number | undefined {
	const sameRow = rows.findIndex((row) => row.key === position.rowKey);
	if (sameRow >= 0) {
		return sameRow;
	}

	const sameFile = fileRowByPath.get(position.path);
	if (sameFile !== undefined) {
		return sameFile;
	}

	const neighbour = files[Math.min(position.fileIndex, files.length - 1)];
	if (!neighbour) {
		return undefined;
	}

	return fileRowByPath.get(neighbour.path);
}

export function anchorPath(rows: ReviewRow[], headers: Int32Array, startIndex: number): string | undefined {
	const row = rows[startIndex];

	if (row?.kind === "file") {
		return row.file.path;
	}
	if (row) {
		return row.path;
	}

	return activeFile(rows, headers, startIndex)?.file.path;
}

export function activeFile(rows: ReviewRow[], headers: Int32Array, startIndex: number): ReviewFileRow | undefined {
	const header = headers[Math.min(startIndex, rows.length - 1)] ?? -1;
	const row = rows[header];

	if (row?.kind === "file") {
		return row;
	}

	return undefined;
}
