import type { DiffLine, FileChange, ReviewContent } from "@main/git/contracts";
import { reviewContentNotice } from "@renderer/routes/-utils/review-notice";

export const REVIEW_ROW_HEIGHT = { file: 32, line: 20, notice: 40 } as const;
export const DIFF_GUTTER_WIDTH = 40;
export const DIFF_TAB_SIZE = 8;

const DIFF_MARKER_COLUMNS = 2;

export type ReviewRow =
	| { kind: "file"; key: string; file: FileChange; open: boolean; first: boolean }
	| { kind: "line"; key: string; path: string; line: DiffLine; lines: DiffLine[]; lineIndex: number }
	| { kind: "notice"; key: string; path: string; message: string };

export type ReviewFileRow = Extract<ReviewRow, { kind: "file" }>;

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
}): ReviewRow[] {
	const rows: ReviewRow[] = [];

	for (const file of files) {
		const open = !closedFiles.has(file.path);
		rows.push({ kind: "file", key: `file:${file.path}`, file, open, first: rows.length === 0 });
		if (!open) {
			continue;
		}

		const content = contentByPath.get(file.path);
		if (!content || content.status !== "ready") {
			rows.push({
				kind: "notice",
				key: `notice:${file.path}`,
				path: file.path,
				message: content ? reviewContentNotice({ content, full: false }) : "File unavailable.",
			});
			continue;
		}

		for (const [lineIndex, line] of content.lines.entries()) {
			rows.push({
				kind: "line",
				key: lineKey(file.path, line),
				path: file.path,
				line,
				lines: content.lines,
				lineIndex,
			});
		}
	}

	return rows;
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

export function anchorPath(rows: ReviewRow[], startIndex: number): string | undefined {
	const row = rows[startIndex];

	if (row?.kind === "line") {
		return row.path;
	}
	if (row?.kind === "file") {
		return row.file.path;
	}

	return activeFile(rows, startIndex)?.file.path;
}

export function activeFile(rows: ReviewRow[], startIndex: number): ReviewFileRow | undefined {
	for (let index = Math.min(startIndex, rows.length - 1); index >= 0; index -= 1) {
		const row = rows[index];
		if (row?.kind === "file") {
			return row;
		}
	}

	return undefined;
}
