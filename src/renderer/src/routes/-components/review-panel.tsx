import { XMarkIcon } from "@heroicons/react/24/outline";
import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FileChange, ReviewMode, ReviewSnapshot } from "@main/git/Git";
import type { Project } from "@main/store/projects";
import { orpc } from "@renderer/lib/api";

const MODES: { mode: ReviewMode; label: string }[] = [
	{ mode: "uncommitted", label: "Uncommitted" },
	{ mode: "branch", label: "Branch" },
];

const DIFF_MARKERS = { context: " ", add: "+", remove: "−" } as const;

const DIFF_INK = {
	context: "text-primary",
	add: "text-added",
	remove: "text-removed",
} as const;

const STATUS_MARK = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "?",
} as const;

export function ReviewPanel({
	project,
	active,
	width,
	onClose,
}: {
	project: Project;
	active: boolean;
	width: number;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<ReviewMode>("uncommitted");
	const snapshot = useQuery(
		orpc.review.snapshot.queryOptions({
			input: { projectId: project.id, mode },
			enabled: active,
			refetchInterval: 2000,
			placeholderData: keepPreviousData,
		}),
	);

	return (
		<aside
			style={{ width }}
			className="flex shrink-0 animate-panel-in flex-col bg-surface-raised motion-reduce:animate-none"
			aria-label="Review"
		>
			<div className="flex items-center justify-between gap-2 border-outline border-b px-3 py-2">
				<div className="flex border border-outline" role="group" aria-label="Diff scope">
					{MODES.map((option, index) => (
						<button
							type="button"
							key={option.mode}
							className={`px-2 py-1 text-body ${index > 0 ? "border-outline border-l" : ""} ${
								mode === option.mode ? "bg-surface-active text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
							}`}
							aria-pressed={mode === option.mode}
							onClick={() => setMode(option.mode)}
						>
							{option.label}
						</button>
					))}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<button
						type="button"
						className="-m-1 p-1 text-secondary hover:text-primary"
						onClick={onClose}
						aria-label="Close review"
					>
						<XMarkIcon className="size-4" />
					</button>
					{snapshot.data?.isRepo && (
						<div
							className="flex gap-2 text-data"
							aria-label={`${snapshot.data.totals.additions} additions, ${snapshot.data.totals.deletions} removals`}
						>
							<span className="text-added">+{snapshot.data.totals.additions}</span>
							<span className="text-removed">−{snapshot.data.totals.deletions}</span>
						</div>
					)}
				</div>
			</div>

			<ReviewBody snapshot={snapshot} />
		</aside>
	);
}

function ReviewBody({ snapshot }: { snapshot: UseQueryResult<ReviewSnapshot> }) {
	if (!snapshot.data) {
		if (snapshot.isError) {
			return <ReviewNotice>{String(snapshot.error)}</ReviewNotice>;
		}
		return <ReviewNotice>Reading changes…</ReviewNotice>;
	}
	if (!snapshot.data.isRepo) {
		return <ReviewNotice>Not a git repository.</ReviewNotice>;
	}
	if (snapshot.data.files.length === 0) {
		return <ReviewNotice>No changes in the working tree.</ReviewNotice>;
	}

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			{snapshot.data.files.map((file) => (
				<ReviewFile key={file.path} file={file} />
			))}
		</div>
	);
}

function ReviewFile({ file }: { file: FileChange }) {
	return (
		<section className="border-outline border-b" aria-label={file.path}>
			<header className="flex items-center justify-between gap-2 px-3 py-2 text-data">
				<span className="flex min-w-0 items-center gap-2">
					<span className="shrink-0 text-secondary">{STATUS_MARK[file.status]}</span>
					<span className="truncate" title={file.path}>
						{file.path}
					</span>
				</span>
				{(file.additions > 0 || file.deletions > 0) && (
					<span className="flex shrink-0 gap-2">
						<span className="text-added">+{file.additions}</span>
						<span className="text-removed">−{file.deletions}</span>
					</span>
				)}
			</header>
			{file.lines.length > 0 && (
				<div className="pb-1">
					{file.lines.map((line, index) => (
						<div className={`flex text-code ${DIFF_INK[line.kind]}`} key={index}>
							<span className="w-8 shrink-0 select-none pr-2 text-right text-outline-strong">{line.number}</span>
							<code className="min-w-0 flex-1 whitespace-pre-wrap break-words">
								{DIFF_MARKERS[line.kind]} {line.content}
							</code>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function ReviewNotice({ children }: { children: string }) {
	return <div className="px-3 py-3 text-data text-secondary">{children}</div>;
}
