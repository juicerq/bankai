import { XMarkIcon } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import type { FileChange, FullFile } from "@main/git/contracts";
import { ReviewDiffLine, ReviewNotice } from "@renderer/routes/-components/review-line";
import { reviewContentNotice } from "@renderer/routes/-utils/review-notice";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";

const LINE_HEIGHT = 20;
const LEADING_CONTEXT = 3;

export function ReviewFocusedFile({
	content,
	file,
	onClose,
}: {
	content?: FullFile;
	file: FileChange;
	onClose: () => void;
}) {
	const notice = content && content.status !== "ready" ? reviewContentNotice({ content, full: true }) : "Reading file\u2026";

	return (
		<section
			data-component="review-focused-file"
			className="absolute inset-0 z-30 flex flex-col bg-surface-raised"
			aria-label={`Focused file ${file.path}`}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onClose();
				}
			}}
		>
			<ReviewFocusedFileHeader file={file} onClose={onClose} />
			<div
				data-slot="body"
				data-content-status={content ? content.status : "pending"}
				className="relative min-h-0 flex-1 bg-surface-raised"
			>
				{content?.status === "ready" && <ReviewFocusedFileReader file={file} content={content} />}
				{content?.status !== "ready" && <ReviewNotice>{notice}</ReviewNotice>}
			</div>
		</section>
	);
}

function ReviewFocusedFileReader({
	file,
	content,
}: {
	file: FileChange;
	content: Extract<FullFile, { status: "ready" }>;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const [initialOffset] = useState(() => {
		const firstChange = content.lines.findIndex((line) => line.kind !== "context");
		if (firstChange <= 0) {
			return 0;
		}

		return Math.max(0, firstChange - LEADING_CONTEXT) * LINE_HEIGHT;
	});
	const virtualizer = useVirtualizer({
		count: content.lines.length,
		getScrollElement: () => scroll.current,
		estimateSize: () => LINE_HEIGHT,
		initialOffset,
		overscan: 24,
	});
	const virtualRows = virtualizer.getVirtualItems();
	const registerScroll = useCallback((node: HTMLDivElement | null) => {
		scroll.current = node;
		if (node) {
			node.scrollTop = initialOffset;
		}
	}, [initialOffset]);

	return (
		<div ref={registerScroll} className="size-full overflow-auto">
			{virtualRows.length === 0 && <ReviewNotice>Reading file…</ReviewNotice>}
			<div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() }}>
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
								path={file.path}
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

function ReviewFocusedFileHeader({ file, onClose }: { file: FileChange; onClose: () => void }) {
	const fileNameStart = file.path.lastIndexOf("/") + 1;
	const directoryPath = file.path.slice(0, fileNameStart);
	const fileName = file.path.slice(fileNameStart);

	return (
		<header className="flex h-8 shrink-0 items-center justify-between gap-2 border-outline border-b bg-surface-raised px-3 text-data">
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<span className="shrink-0 text-secondary">{STATUS_MARK[file.status]}</span>
				<span className="flex min-w-0 flex-1" title={file.path}>
					<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
					<span dir="rtl" className="max-w-full shrink-0 truncate text-primary">{`${fileName}\u200E`}</span>
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-2">
				{(file.additions > 0 || file.deletions > 0) && (
					<>
						<span className="text-added">+{file.additions}</span>
						<span className="text-removed">−{file.deletions}</span>
					</>
				)}
				<button
					type="button"
					autoFocus
					className="-m-1 p-1 text-secondary hover:text-primary"
					aria-label={`Return from focused file ${file.path}`}
					onClick={onClose}
				>
					<XMarkIcon className="size-4" />
				</button>
			</span>
		</header>
	);
}
