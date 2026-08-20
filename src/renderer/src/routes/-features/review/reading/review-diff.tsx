import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject, type UIEvent } from "react";
import type { FileChange, ReviewContent, ReviewMode } from "@shared/review";
import { ReviewFileHeader } from "@renderer/routes/-features/review/reading/review-file-header";
import { ReviewDiffGap } from "@renderer/routes/-features/review/reading/review-gap";
import { ReviewDiffLine, ReviewNotice } from "@renderer/routes/-features/review/reading/review-line";
import {
	activeFile,
	anchorPath,
	diffContentWidth,
	readingOffset,
	reviewRows,
	DIFF_TAB_SIZE,
	REVIEW_ROW_HEIGHT,
	type ReadingPosition,
	type ReviewRow,
} from "@renderer/routes/-features/review/reading/review-rows";
import { REVIEW_SCOPES } from "@renderer/routes/-features/review/header/review-scope";
import type { ReviewReading } from "@renderer/routes/-features/review/reading/use-review-reading";

const REVIEW_ROW_OVERSCAN = 96;

export interface ReviewDiffHandle {
	revealFile: (path: string) => void;
	restoreReadingPosition: () => void;
}

export function ReviewDiff({
	ref,
	mode,
	generation,
	error,
	covered,
	closedFiles,
	onToggleOpen,
	onFocusFile,
}: {
	ref?: Ref<ReviewDiffHandle>;
	mode: ReviewMode;
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
	if (snapshot.state === "not-a-repo") {
		return <ReviewNotice reason="not-a-repo">Not a git repository.</ReviewNotice>;
	}
	if (snapshot.state === "no-turn") {
		return <ReviewNotice reason="no-turn">No agent turn seen here yet.</ReviewNotice>;
	}
	if (files.length === 0) {
		return <ReviewNotice reason="empty">{REVIEW_SCOPES[mode].empty}</ReviewNotice>;
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
	const { rows, headers } = useMemo(
		() => reviewRows({ files, closedFiles, contentByPath }),
		[closedFiles, contentByPath, files],
	);
	const fileRowByPath = useMemo(
		() => new Map(rows.flatMap((row, index) => (row.kind === "file" ? [[row.file.path, index] as const] : []))),
		[rows],
	);
	const contentWidth = useMemo(
		() =>
			diffContentWidth(
				files.flatMap((file) => {
					const content = contentByPath.get(file.path);
					if (content?.status !== "ready") {
						return [];
					}

					return content.lines;
				}),
			),
		[contentByPath, files],
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
		const path = item ? anchorPath(rows, headers, item.index) : undefined;
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
	const activeFileRow = activeFile(rows, headers, virtualizer.range?.startIndex ?? 0);

	return (
		<div
			ref={attachScroll}
			onScroll={trackReadingPosition}
			className="min-h-0 flex-1 overflow-auto"
			inert={covered}
			aria-hidden={covered || undefined}
		>
			{activeFileRow && (
				<div style={{ width: contentWidth }} className="sticky top-0 left-0 z-20 h-0 min-w-full">
					<ReviewFileHeader
						row={activeFileRow}
						sticky
						onToggleOpen={onToggleOpen}
						onFocusFile={onFocusFile}
					/>
				</div>
			)}
			<div
				style={{ width: contentWidth, height: virtualizer.getTotalSize(), tabSize: DIFF_TAB_SIZE }}
				className="relative min-w-full"
			>
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

const ReviewVirtualRow = memo(function ReviewVirtualRow({
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
	if (row.kind === "gap") {
		return <ReviewDiffGap skipped={row.skipped} />;
	}

	return <ReviewDiffLine path={row.path} line={row.line} lines={row.lines} lineIndex={row.lineIndex} />;
});
