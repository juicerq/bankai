import { ChevronDownIcon, ChevronRightIcon, ViewfinderCircleIcon } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject, type UIEvent } from "react";
import type { DiffLine, FileChange, ReviewContent } from "@main/git/contracts";
import { ReviewDiffLine, ReviewNotice, reviewContentNotice } from "@renderer/routes/-components/review-line";
import type { ReviewReading } from "@renderer/routes/-utils/use-review-reading";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";

export const REVIEW_ROW_HEIGHT = { file: 32, line: 20, notice: 40 } as const;
const REVIEW_ROW_OVERSCAN = 96;

type ReviewRow =
	| { kind: "file"; key: string; file: FileChange; open: boolean; first: boolean }
	| { kind: "line"; key: string; path: string; line: DiffLine; lines: DiffLine[]; lineIndex: number }
	| { kind: "notice"; key: string; path: string; message: string };

interface ReadingPosition {
	rowKey: string;
	path: string;
	fileIndex: number;
	rowOffset: number;
	scrollLeft: number;
}

export interface ReviewDiffHandle {
	revealFile: (path: string) => void;
	restoreReadingPosition: () => void;
}

export function ReviewDiff({
	ref,
	generation,
	error,
	covered,
	closedFiles,
	onToggleOpen,
	onFocusFile,
}: {
	ref?: Ref<ReviewDiffHandle>;
	generation?: NonNullable<ReviewReading["generation"]>;
	error?: string;
	covered: boolean;
	closedFiles: ReadonlySet<string>;
	onToggleOpen: (path: string) => void;
	onFocusFile: (path: string) => void;
}) {
	const position = useRef<ReadingPosition | null>(null);
	const snapshot = generation?.snapshot;
	const contentByPath = generation?.contentByPath;
	const files = snapshot?.files ?? [];

	if (!snapshot) {
		return <ReviewNotice>{error ?? "Reading changes\u2026"}</ReviewNotice>;
	}
	if (!snapshot.isRepo) {
		return <ReviewNotice>Not a git repository.</ReviewNotice>;
	}
	if (files.length === 0) {
		return <ReviewNotice>No changes in the working tree.</ReviewNotice>;
	}
	if (!contentByPath) {
		return <ReviewNotice>Reading changes…</ReviewNotice>;
	}

	return (
		<ReviewDiffView
			key={generation.layoutGeneration}
			ref={ref}
			position={position}
			files={files}
			contentByPath={contentByPath}
			covered={covered}
			closedFiles={closedFiles}
			onToggleOpen={onToggleOpen}
			onFocusFile={onFocusFile}
		/>
	);
}

function ReviewDiffView({
	ref,
	position,
	files,
	contentByPath,
	covered,
	closedFiles,
	onToggleOpen,
	onFocusFile,
}: {
	ref?: Ref<ReviewDiffHandle>;
	position: RefObject<ReadingPosition | null>;
	files: FileChange[];
	contentByPath: ReadonlyMap<string, ReviewContent>;
	covered: boolean;
	closedFiles: ReadonlySet<string>;
	onToggleOpen: (path: string) => void;
	onFocusFile: (path: string) => void;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const rows = useMemo(
		() => reviewRows(files, closedFiles, contentByPath),
		[closedFiles, contentByPath, files],
	);
	const fileRowByPath = useMemo(
		() => new Map(rows.flatMap((row, index) => (row.kind === "file" ? [[row.file.path, index] as const] : []))),
		[rows],
	);
	const [initialOffset] = useState(() => readingOffset(position.current, rows, fileRowByPath, files));
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scroll.current,
		getItemKey: (index) => rows[index]?.key ?? index,
		estimateSize: (index) => REVIEW_ROW_HEIGHT[rows[index]?.kind ?? "notice"],
		overscan: REVIEW_ROW_OVERSCAN,
		initialOffset,
	});
	const attachScroll = useCallback(
		(node: HTMLDivElement | null) => {
			scroll.current = node;
			if (node && position.current) {
				node.scrollTop = initialOffset;
				node.scrollLeft = position.current.scrollLeft;
			}
		},
		[initialOffset, position],
	);

	const trackReadingPosition = (event: UIEvent<HTMLDivElement>) => {
		const node = event.currentTarget;
		const item = virtualizer.getVirtualItemForOffset(node.scrollTop);
		const path = item ? anchorPath(rows, item.index) : undefined;
		if (!item || !path) {
			position.current = null;
			return;
		}

		position.current = {
			rowKey: rows[item.index]?.key ?? `file:${path}`,
			path,
			fileIndex: files.findIndex((file) => file.path === path),
			rowOffset: node.scrollTop - item.start,
			scrollLeft: node.scrollLeft,
		};
	};

	useImperativeHandle(ref, () => ({
		revealFile(path) {
			const row = fileRowByPath.get(path);
			if (row !== undefined) {
				virtualizer.scrollToIndex(row, { align: "start" });
			}
		},
		restoreReadingPosition() {
			if (!position.current) {
				return;
			}

			virtualizer.scrollToOffset(readingOffset(position.current, rows, fileRowByPath, files));
			if (scroll.current) {
				scroll.current.scrollLeft = position.current.scrollLeft;
			}
		},
	}));

	const virtualRows = virtualizer.getVirtualItems();
	const activeFileRow = activeFile(rows, virtualizer.range?.startIndex ?? 0);

	return (
		<div
			ref={attachScroll}
			onScroll={trackReadingPosition}
			className="min-h-0 flex-1 overflow-auto"
			inert={covered}
			aria-hidden={covered || undefined}
		>
			{activeFileRow && (
				<div className="sticky top-0 left-0 z-20 h-0 w-full">
					<ReviewFileHeader
						row={activeFileRow}
						sticky
						onToggleOpen={onToggleOpen}
						onFocusFile={onFocusFile}
					/>
				</div>
			)}
			<div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() }}>
				{virtualRows.map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (!row) {
						return null;
					}

					return (
						<div
							key={row.key}
							className={`absolute top-0 left-0 min-w-full ${row.kind === "file" ? "w-full" : "w-max"}`}
							style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
						>
							{row !== activeFileRow && (
								<ReviewVirtualRow
									row={row}
									onToggleOpen={onToggleOpen}
									onFocusFile={onFocusFile}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ReviewVirtualRow({
	row,
	onToggleOpen,
	onFocusFile,
}: {
	row: ReviewRow;
	onToggleOpen: (path: string) => void;
	onFocusFile: (path: string) => void;
}) {
	if (row.kind === "file") {
		return <ReviewFileHeader row={row} onToggleOpen={onToggleOpen} onFocusFile={onFocusFile} />;
	}
	if (row.kind === "notice") {
		return <ReviewNotice>{row.message}</ReviewNotice>;
	}

	return <ReviewDiffLine path={row.path} line={row.line} lines={row.lines} lineIndex={row.lineIndex} />;
}

function ReviewFileHeader({
	row,
	sticky = false,
	onToggleOpen,
	onFocusFile,
}: {
	row: Extract<ReviewRow, { kind: "file" }>;
	sticky?: boolean;
	onToggleOpen: (path: string) => void;
	onFocusFile: (path: string) => void;
}) {
	const ChevronIcon = row.open ? ChevronDownIcon : ChevronRightIcon;
	const fileNameStart = row.file.path.lastIndexOf("/") + 1;
	const directoryPath = row.file.path.slice(0, fileNameStart);
	const fileName = row.file.path.slice(fileNameStart);

	return (
		<header
			className={`flex h-8 w-full items-center justify-between gap-2 border-outline bg-surface-raised px-3 text-data ${
				row.first || sticky ? "" : "border-t"
			}`}
		>
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<span className="shrink-0 text-secondary">{STATUS_MARK[row.file.status]}</span>
				<button
					type="button"
					className="group -m-1 flex min-w-0 flex-1 items-center gap-2 p-1 text-left text-body"
					aria-expanded={row.open}
					aria-label={`${row.open ? "Close" : "Open"} ${row.file.path}`}
					onClick={() => onToggleOpen(row.file.path)}
				>
					<span className="flex min-w-0 flex-1 group-hover:underline" title={row.file.path}>
						<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
						<span dir="rtl" className="max-w-full shrink-0 truncate text-primary">{`${fileName}\u200E`}</span>
					</span>
					<ChevronIcon className="size-4 shrink-0 text-secondary group-hover:text-primary" />
				</button>
			</span>
			<span className="flex shrink-0 items-center gap-2">
				{(row.file.additions > 0 || row.file.deletions > 0) && (
					<>
						<span className="text-added">+{row.file.additions}</span>
						<span className="text-removed">−{row.file.deletions}</span>
					</>
				)}
				<button
					type="button"
					className="-m-1 p-1 text-secondary hover:text-primary"
					aria-label={`Focus ${row.file.path}`}
					onClick={() => onFocusFile(row.file.path)}
				>
					<ViewfinderCircleIcon className="size-4" />
				</button>
			</span>
		</header>
	);
}

function reviewRows(
	files: FileChange[],
	closedFiles: ReadonlySet<string>,
	contentByPath: ReadonlyMap<string, ReviewContent>,
): ReviewRow[] {
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
				message: content ? reviewContentNotice(content, false) : "File unavailable.",
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

function lineKey(path: string, line: DiffLine): string {
	return `line:${path}:${line.hunk}:${line.oldNumber ?? ""}:${line.number ?? ""}:${line.kind}`;
}

function readingOffset(
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

function anchorPath(rows: ReviewRow[], startIndex: number): string | undefined {
	const row = rows[startIndex];

	if (row?.kind === "line") {
		return row.path;
	}
	if (row?.kind === "file") {
		return row.file.path;
	}

	return activeFile(rows, startIndex)?.file.path;
}

function activeFile(rows: ReviewRow[], startIndex: number): Extract<ReviewRow, { kind: "file" }> | undefined {
	for (let index = Math.min(startIndex, rows.length - 1); index >= 0; index -= 1) {
		const row = rows[index];
		if (row?.kind === "file") {
			return row;
		}
	}

	return undefined;
}
