import {
	ArrowsPointingOutIcon,
	ChevronDownIcon,
	ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Suspense, use, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import type { DiffLine, FileChange, FullFile, ReviewContent, ReviewMode, ReviewSnapshot } from "@main/git/Git";
import { orpc } from "@renderer/lib/api";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";
import { reviewHighlights } from "@renderer/routes/-utils/review-highlights";
import type { HighlightedLines, SyntaxSpan, SyntaxTone } from "@renderer/routes/-utils/review-syntax";

const DIFF_MARKERS = { context: " ", add: "+", remove: "−" } as const;

const DIFF_INK = {
	context: "diff-line-context",
	add: "diff-line-add",
	remove: "diff-line-remove",
} as const;

const DIFF_MARKER_INK = {
	context: "text-primary",
	add: "text-added",
	remove: "text-removed",
} as const;

const SYNTAX_CLASS: Record<SyntaxTone, string> = {
	plain: "syntax-plain",
	comment: "syntax-comment",
	keyword: "syntax-keyword",
	string: "syntax-string",
	constant: "syntax-constant",
	entity: "syntax-entity",
	type: "syntax-type",
};

const ROW_HEIGHT = { file: 32, line: 20, notice: 40 } as const;

type FullFileState = { data?: FullFile; error?: string };

type ReviewRow =
	| { kind: "file"; key: string; file: FileChange; open: boolean; full: boolean; first: boolean }
	| { kind: "line"; key: string; path: string; line: DiffLine; lines: DiffLine[]; lineIndex: number }
	| { kind: "notice"; key: string; message: string };

export type ReviewDiffHandle = { revealFile: (path: string) => void };

export function ReviewDiff({
	ref,
	snapshot,
	error,
	projectId,
	mode,
	closedFiles,
	fullFiles,
	onToggleOpen,
	onToggleFull,
}: {
	ref?: Ref<ReviewDiffHandle>;
	snapshot?: ReviewSnapshot;
	error?: string;
	projectId: string;
	mode: ReviewMode;
	closedFiles: ReadonlySet<string>;
	fullFiles: ReadonlySet<string>;
	onToggleOpen: (path: string) => void;
	onToggleFull: (path: string) => void;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const files = snapshot?.files ?? [];
	const requestedFullFiles = useMemo(
		() => files.filter((file) => fullFiles.has(file.path) && !closedFiles.has(file.path)).map((file) => file.path),
		[closedFiles, files, fullFiles],
	);
	const fullFileStates = useQueries({
		queries: requestedFullFiles.map((path) =>
			orpc.review.fullFile.queryOptions({
				input: { projectId, path, mode },
				refetchInterval: (query) => (query.state.data?.status === "too-large" ? false : 2000),
			}),
		),
		combine: combineFullFileStates,
	});
	const fullFileByPath = useMemo(
		() => new Map(requestedFullFiles.map((path, index) => [path, fullFileStates[index]])),
		[fullFileStates, requestedFullFiles],
	);
	const rows = useMemo(
		() => reviewRows(files, closedFiles, fullFiles, fullFileByPath),
		[closedFiles, files, fullFileByPath, fullFiles],
	);
	const fileRowByPath = useMemo(
		() => new Map(rows.flatMap((row, index) => (row.kind === "file" ? [[row.file.path, index] as const] : []))),
		[rows],
	);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scroll.current,
		getItemKey: (index) => rows[index]?.key ?? index,
		estimateSize: (index) => ROW_HEIGHT[rows[index]?.kind ?? "notice"],
		overscan: 16,
	});

	useImperativeHandle(
		ref,
		() => ({
			revealFile(path) {
				const row = fileRowByPath.get(path);
				if (row !== undefined) {
					virtualizer.scrollToIndex(row, { align: "start" });
				}
			},
		}),
		[fileRowByPath, virtualizer],
	);

	if (!snapshot) {
		return <ReviewNotice>{error ?? "Reading changes\u2026"}</ReviewNotice>;
	}
	if (!snapshot.isRepo) {
		return <ReviewNotice>Not a git repository.</ReviewNotice>;
	}
	if (files.length === 0) {
		return <ReviewNotice>No changes in the working tree.</ReviewNotice>;
	}

	const virtualRows = virtualizer.getVirtualItems();
	const activeFileRow = activeFile(rows, virtualizer.range?.startIndex ?? 0);

	return (
		<div ref={scroll} className="min-h-0 flex-1 overflow-auto">
			{activeFileRow && (
				<div className="sticky top-0 left-0 z-20 h-0 min-w-full w-fit">
					<ReviewFileHeader row={activeFileRow} onToggleOpen={onToggleOpen} onToggleFull={onToggleFull} />
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
								className="absolute top-0 left-0 min-w-full w-max"
								style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
							>
								{row !== activeFileRow && (
									<ReviewVirtualRow row={row} onToggleOpen={onToggleOpen} onToggleFull={onToggleFull} />
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
	onToggleFull,
}: {
	row: ReviewRow;
	onToggleOpen: (path: string) => void;
	onToggleFull: (path: string) => void;
}) {
	if (row.kind === "file") {
		return <ReviewFileHeader row={row} onToggleOpen={onToggleOpen} onToggleFull={onToggleFull} />;
	}
	if (row.kind === "notice") {
		return <ReviewNotice>{row.message}</ReviewNotice>;
	}

	return <ReviewDiffLine row={row} />;
}

function ReviewFileHeader({
	row,
	onToggleOpen,
	onToggleFull,
}: {
	row: Extract<ReviewRow, { kind: "file" }>;
	onToggleOpen: (path: string) => void;
	onToggleFull: (path: string) => void;
}) {
	const ChevronIcon = row.open ? ChevronDownIcon : ChevronRightIcon;
	const fileNameStart = row.file.path.lastIndexOf("/") + 1;
	const directoryPath = row.file.path.slice(0, fileNameStart);
	const fileName = row.file.path.slice(fileNameStart);

	return (
		<header
			className={`flex h-8 min-w-full items-center justify-between gap-2 border-outline bg-surface-raised px-3 text-data ${
				row.first ? "" : "border-t"
			}`}
		>
			<span className="flex min-w-0 items-center gap-2">
				<span className="shrink-0 text-secondary">{STATUS_MARK[row.file.status]}</span>
				<button
					type="button"
					className="group -m-1 flex min-w-0 items-center gap-2 p-1 text-left text-body"
					aria-expanded={row.open}
					aria-label={`${row.open ? "Close" : "Open"} ${row.file.path}`}
					onClick={() => onToggleOpen(row.file.path)}
				>
					<span className="flex min-w-0 group-hover:underline">
						<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
						<span className="shrink-0 text-primary">{fileName}</span>
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
					className={`-m-1 p-1 hover:text-primary ${row.full ? "text-tertiary" : "text-secondary"}`}
					aria-pressed={row.full}
					aria-label={`${row.full ? "Collapse" : "Expand"} ${row.file.path} to the full file`}
					onClick={() => onToggleFull(row.file.path)}
				>
					<ArrowsPointingOutIcon className="size-4" />
				</button>
			</span>
		</header>
	);
}

function ReviewDiffLine({ row }: { row: Extract<ReviewRow, { kind: "line" }> }) {
	const highlights = reviewHighlights(row.path, row.lines);

	return (
		<div className={`diff-line flex h-5 min-w-full w-max items-center text-code text-primary ${DIFF_INK[row.line.kind]}`}>
			<span className="sticky left-0 flex h-5 w-10 shrink-0 select-none items-center justify-end border-outline border-r bg-surface-sunken pr-2 text-secondary">
				{row.line.number ?? row.line.oldNumber}
			</span>
			<code className="whitespace-pre">
				<span className={`select-none ${DIFF_MARKER_INK[row.line.kind]}`}>{DIFF_MARKERS[row.line.kind]} </span>
				{!highlights && row.line.content}
				{!!highlights && (
					<Suspense fallback={row.line.content}>
						<ReviewHighlightedCode content={row.line.content} highlights={highlights} lineIndex={row.lineIndex} />
					</Suspense>
				)}
			</code>
		</div>
	);
}

function ReviewHighlightedCode({
	content,
	highlights,
	lineIndex,
}: {
	content: string;
	highlights: Promise<HighlightedLines | null>;
	lineIndex: number;
}) {
	const spans = use(highlights)?.[lineIndex];
	if (!spans) {
		return content;
	}

	return <>{renderSpans(content, spans)}</>;
}

function ReviewNotice({ children }: { children: string }) {
	return <div className="flex h-10 min-w-full items-center px-3 text-data text-secondary">{children}</div>;
}

function combineFullFileStates(results: UseQueryResult<FullFile>[]): FullFileState[] {
	return results.map((result) => ({
		data: result.data,
		error: result.isError ? String(result.error) : undefined,
	}));
}

function reviewRows(
	files: FileChange[],
	closedFiles: ReadonlySet<string>,
	fullFiles: ReadonlySet<string>,
	fullFileByPath: ReadonlyMap<string, FullFileState | undefined>,
): ReviewRow[] {
	const rows: ReviewRow[] = [];

	for (const file of files) {
		const open = !closedFiles.has(file.path);
		const full = fullFiles.has(file.path);
		rows.push({ kind: "file", key: `file:${file.path}`, file, open, full, first: rows.length === 0 });
		if (!open) {
			continue;
		}

		const state = full ? fullFileByPath.get(file.path) : undefined;
		const content = full ? state?.data : file.content;
		if (!content) {
			rows.push({
				kind: "notice",
				key: `notice:${file.path}`,
				message: state?.error ?? "Reading file\u2026",
			});
			continue;
		}
		if (content.status !== "ready") {
			rows.push({
				kind: "notice",
				key: `notice:${file.path}`,
				message: reviewContentNotice(content, full),
			});
			continue;
		}

		for (const [lineIndex, line] of content.lines.entries()) {
			rows.push({
				kind: "line",
				key: lineKey(file.path, full, line),
				path: file.path,
				line,
				lines: content.lines,
				lineIndex,
			});
		}
	}

	return rows;
}

function reviewContentNotice(content: Exclude<ReviewContent, { status: "ready" }>, full: boolean): string {
	switch (content.status) {
		case "empty":
			return "Empty file.";
		case "binary":
			return "Binary content cannot be shown.";
		case "too-large":
			if (content.lineCount) {
				return `${full ? "Too large to show in full" : "Too large to show"}: ${content.lineCount} lines.`;
			}
			return full ? "Too large to show in full." : "Too large to show.";
		case "unavailable":
			return "File unavailable. Retrying\u2026";
	}
}

function lineKey(path: string, full: boolean, line: DiffLine): string {
	return `line:${path}:${full ? "full" : "diff"}:${line.hunk}:${line.oldNumber ?? ""}:${line.number ?? ""}:${line.kind}`;
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

function renderSpans(content: string, spans: SyntaxSpan[]) {
	let offset = 0;
	const rendered = spans.map((span, index) => {
		const start = offset;
		offset += span.length;

		return (
			<span className={SYNTAX_CLASS[span.tone]} key={`${start}:${index}`}>
				{content.slice(start, offset)}
			</span>
		);
	});

	if (offset < content.length) {
		rendered.push(<span key={offset}>{content.slice(offset)}</span>);
	}

	return rendered;
}
