import { XMarkIcon } from "@heroicons/react/24/outline";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import type { FileChange, ReviewMode } from "@main/git/Git";
import { orpc } from "@renderer/lib/api";
import { ReviewDiffLine, ReviewNotice, reviewContentNotice } from "@renderer/routes/-components/review-line";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";

const LINE_HEIGHT = 20;
const LEADING_CONTEXT = 3;
const NO_LINES = [] as const;

export function ReviewFocusedFile({
	projectId,
	mode,
	file,
	onClose,
}: {
	projectId: string;
	mode: ReviewMode;
	file: FileChange;
	onClose: () => void;
}) {
	const scroll = useRef<HTMLDivElement>(null);
	const positioned = useRef(false);
	const { data: content } = useQuery(
		orpc.review.fullFile.queryOptions({
			input: { projectId, path: file.path, mode },
			refetchInterval: (query) => (query.state.data?.status === "too-large" ? false : 2000),
			placeholderData: keepPreviousData,
		}),
	);
	const lines = content?.status === "ready" ? content.lines : NO_LINES;
	const virtualizer = useVirtualizer({
		count: lines.length,
		getScrollElement: () => scroll.current,
		estimateSize: () => LINE_HEIGHT,
		overscan: 24,
	});

	useEffect(() => {
		// Imperative scroll: place the reader at the first changed line once the content first loads.
		if (positioned.current || content?.status !== "ready") {
			return;
		}
		positioned.current = true;
		const firstChange = content.lines.findIndex((line) => line.kind !== "context");
		if (firstChange > 0) {
			virtualizer.scrollToIndex(Math.max(0, firstChange - LEADING_CONTEXT), { align: "start" });
		}
	}, [content, virtualizer]);

	const notice = content && content.status !== "ready" ? reviewContentNotice(content, true) : "Reading file\u2026";
	const body =
		content?.status === "ready" ? (
			<div ref={scroll} className="min-h-0 flex-1 overflow-auto">
				<div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() }}>
					{virtualizer.getVirtualItems().map((virtualRow) => {
						const line = lines[virtualRow.index];
						if (!line) {
							return null;
						}

						return (
							<div
								key={virtualRow.key}
								className="absolute top-0 left-0 min-w-full w-max"
								style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
							>
								<ReviewDiffLine path={file.path} line={line} lines={content.lines} lineIndex={virtualRow.index} />
							</div>
						);
					})}
				</div>
			</div>
		) : (
			<ReviewNotice>{notice}</ReviewNotice>
		);

	return (
		<section
			className="absolute inset-0 z-30 flex flex-col bg-surface-raised"
			aria-label={`Focused file ${file.path}`}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onClose();
				}
			}}
		>
			<ReviewFocusedFileHeader file={file} onClose={onClose} />
			{body}
		</section>
	);
}

function ReviewFocusedFileHeader({ file, onClose }: { file: FileChange; onClose: () => void }) {
	const fileNameStart = file.path.lastIndexOf("/") + 1;
	const directoryPath = file.path.slice(0, fileNameStart);
	const fileName = file.path.slice(fileNameStart);

	return (
		<header className="flex h-8 shrink-0 items-center justify-between gap-2 border-outline border-b bg-surface-raised px-3 text-data">
			<span className="flex min-w-0 items-center gap-2">
				<span className="shrink-0 text-secondary">{STATUS_MARK[file.status]}</span>
				<span className="flex min-w-0">
					<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
					<span className="shrink-0 text-primary">{fileName}</span>
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
