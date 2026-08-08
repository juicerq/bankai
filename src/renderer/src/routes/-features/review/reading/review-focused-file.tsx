import { XMarkIcon } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, useState } from "react";
import type { DiffLine, FileChange, FullFile } from "@shared/review";
import { ReviewDiffLine, ReviewNotice } from "@renderer/routes/-features/review/reading/review-line";
import { reviewContentNotice } from "@renderer/routes/-features/review/reading/review-notice";
import { diffContentWidth, DIFF_TAB_SIZE, REVIEW_ROW_HEIGHT } from "@renderer/routes/-features/review/reading/review-rows";
import { STATUS_MARK } from "@renderer/routes/-features/review/tree/status-mark";

export const LEADING_CONTEXT = 3;

const takeFocus = (element: HTMLElement | null) => element?.focus();

export function ReviewFocusedFile({
	content,
	error,
	path,
	line,
	change,
	onClose,
}: {
	content?: FullFile;
	error?: string;
	path: string;
	line?: number;
	change?: FileChange;
	onClose: () => void;
}) {
	return (
		<section
			data-component="review-focused-file"
			data-path={path}
			className="absolute inset-0 z-30 flex flex-col bg-surface-raised outline-none"
			aria-label={`Focused file ${path}`}
			tabIndex={-1}
			ref={takeFocus}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onClose();
				}
			}}
		>
			<ReviewFocusedFileHeader path={path} change={change} onClose={onClose} />
			<div
				data-slot="body"
				data-content-status={focusedFileStatus({ content, error })}
				className="relative min-h-0 flex-1 bg-surface-raised"
			>
				<ReviewFocusedFileBody path={path} line={line} content={content} error={error} />
			</div>
		</section>
	);
}

function focusedFileStatus({ content, error }: { content?: FullFile; error?: string }) {
	if (content) {
		return content.status;
	}
	if (error) {
		return "error";
	}

	return "pending";
}

function ReviewFocusedFileBody({
	path,
	line,
	content,
	error,
}: {
	path: string;
	line?: number;
	content?: FullFile;
	error?: string;
}) {
	if (content?.status === "ready") {
		return <ReviewFocusedFileReader path={path} line={line} content={content} />;
	}
	if (content) {
		return <ReviewNotice>{reviewContentNotice({ content, full: true })}</ReviewNotice>;
	}
	if (error) {
		return <ReviewNotice reason="error">{error}</ReviewNotice>;
	}

	return <ReviewNotice>Reading file…</ReviewNotice>;
}

function ReviewFocusedFileReader({
	path,
	line,
	content,
}: {
	path: string;
	line?: number;
	content: Extract<FullFile, { status: "ready" }>;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const [initialOffset] = useState(() => readerOffset({ lines: content.lines, line }));
	const virtualizer = useVirtualizer({
		count: content.lines.length,
		getScrollElement: () => scroll.current,
		estimateSize: () => REVIEW_ROW_HEIGHT.line,
		initialOffset,
		overscan: 24,
	});
	const contentWidth = useMemo(() => diffContentWidth(content.lines), [content.lines]);
	const virtualRows = virtualizer.getVirtualItems();
	const registerScroll = useCallback((node: HTMLDivElement | null) => {
		scroll.current = node;
		if (node) {
			node.scrollTop = initialOffset;
		}
	}, [initialOffset]);

	return (
		<div data-slot="scroll" ref={registerScroll} className="size-full overflow-auto">
			{virtualRows.length === 0 && <ReviewNotice>Reading file…</ReviewNotice>}
			<div
				data-slot="content"
				style={{
					width: contentWidth,
					height: virtualizer.getTotalSize(),
					tabSize: DIFF_TAB_SIZE,
				}}
				className="relative min-w-full"
			>
				{virtualRows.map((virtualRow) => {
					const line = content.lines[virtualRow.index];
					if (!line) {
						return null;
					}

					return (
						<div
							key={virtualRow.key}
							className="absolute top-0 left-0 min-w-full w-max"
							style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
						>
							<ReviewDiffLine
								path={path}
								line={line}
								lines={content.lines}
								lineIndex={virtualRow.index}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function readerOffset({ lines, line }: { lines: DiffLine[]; line?: number }) {
	const asked = line === undefined ? -1 : lines.findIndex((entry) => entry.number === line);
	const index = asked >= 0 ? asked : lines.findIndex((entry) => entry.kind !== "context");

	if (index <= 0) {
		return 0;
	}

	return Math.max(0, index - LEADING_CONTEXT) * REVIEW_ROW_HEIGHT.line;
}

function ReviewFocusedFileHeader({
	path,
	change,
	onClose,
}: {
	path: string;
	change?: FileChange;
	onClose: () => void;
}) {
	const fileNameStart = path.lastIndexOf("/") + 1;
	const directoryPath = path.slice(0, fileNameStart);
	const fileName = path.slice(fileNameStart);

	return (
		<header className="flex h-8 shrink-0 items-center justify-between gap-2 border-outline border-b bg-surface-raised px-3 text-data">
			<span className="flex min-w-0 flex-1 items-center gap-2">
				{change && <span className="shrink-0 text-secondary">{STATUS_MARK[change.status]}</span>}
				<span className="flex min-w-0 flex-1" title={path}>
					<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
					<span dir="rtl" className="max-w-full shrink-0 truncate text-primary">{`${fileName}\u200E`}</span>
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-2">
				{change && (change.additions > 0 || change.deletions > 0) && (
					<>
						<span className="text-added">+{change.additions}</span>
						<span className="text-removed">−{change.deletions}</span>
					</>
				)}
				<button
					type="button"
					className="-m-1 p-1 text-secondary hover:text-primary"
					aria-label={`Return from focused file ${path}`}
					onClick={onClose}
				>
					<XMarkIcon className="size-4" />
				</button>
			</span>
		</header>
	);
}
