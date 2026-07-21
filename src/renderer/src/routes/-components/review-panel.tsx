import {
	ArrowsPointingOutIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FolderIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { DiffLine, FileChange, FullFile, ReviewMode, ReviewSnapshot } from "@main/git/Git";
import type { Project } from "@main/store/projects";
import { orpc } from "@renderer/lib/api";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import { STATUS_MARK } from "@renderer/routes/-utils/status-mark";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

const MODES: { mode: ReviewMode; label: string }[] = [
	{ mode: "uncommitted", label: "Uncommitted" },
	{ mode: "branch", label: "Branch" },
];

const DIFF_MARKERS = { context: " ", add: "+", remove: "−" } as const;

const DIFF_INK = {
	context: "text-primary opacity-60",
	add: "text-added",
	remove: "text-removed",
} as const;

export function ReviewPanel({
	project,
	active,
	diffWidth,
	minDiffWidth,
	onClose,
}: {
	project: Project;
	active: boolean;
	diffWidth: number;
	minDiffWidth: number;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<ReviewMode>("uncommitted");
	const [treeOpen, setTreeOpen] = useState(false);
	const [closedFiles, setClosedFiles] = useState<ReadonlySet<string>>(new Set());
	const [fullFiles, setFullFiles] = useState<ReadonlySet<string>>(new Set());
	const sections = useRef(new Map<string, HTMLElement | null>());
	const diff = useRef<HTMLDivElement>(null);
	const snapshot = useQuery(
		orpc.review.snapshot.queryOptions({
			input: { projectId: project.id, mode },
			enabled: active,
			refetchInterval: 2000,
			placeholderData: keepPreviousData,
		}),
	);

	const selectMode = (next: ReviewMode) => {
		setMode(next);
		setFullFiles(new Set());
	};

	const revealFile = (path: string) => {
		setClosedFiles((current) => {
			const next = new Set(current);
			next.delete(path);
			return next;
		});

		const container = diff.current;
		const section = sections.current.get(path);
		if (!container || !section) {
			return;
		}

		container.scrollTop += section.getBoundingClientRect().top - container.getBoundingClientRect().top;
	};

	const toggleFullFile = (path: string) => setFullFiles((current) => toggledSet(current, path));

	return (
		<aside
			className="flex animate-panel-in bg-surface-raised motion-reduce:animate-none"
			aria-label="Review"
		>
			{treeOpen && (
				<ReviewTree
					key={mode}
					files={snapshot.data?.files ?? []}
					fullFiles={fullFiles}
					onOpenFile={revealFile}
					onToggleFullFile={(path) => {
						revealFile(path);
						toggleFullFile(path);
					}}
				/>
			)}

			<div style={{ width: diffWidth, minWidth: minDiffWidth }} className="flex flex-col">
				<div className="flex h-header shrink-0 items-center justify-between border-outline border-b">
					<div className="flex h-full min-w-0 overflow-hidden">
						<button
							type="button"
							className={`flex size-header shrink-0 items-center justify-center border-outline border-r hover:bg-surface-hover hover:text-primary ${
								treeOpen ? "text-tertiary" : "text-secondary"
							}`}
							aria-expanded={treeOpen}
							aria-label="Toggle file tree"
							title="Toggle file tree"
							onClick={() => setTreeOpen((current) => !current)}
						>
							<FolderIcon className="size-4" />
						</button>
						<div className="flex h-full" role="group" aria-label="Diff scope">
							{MODES.map((option) => (
								<button
									type="button"
									key={option.mode}
									className={`flex h-full shrink-0 items-center border-outline border-r px-3 text-body ${
										mode === option.mode ? "bg-surface-active text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
									}`}
									aria-pressed={mode === option.mode}
									onClick={() => selectMode(option.mode)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2 px-3">
						{snapshot.data?.isRepo && (
							<div
								className="flex gap-2 text-data"
								aria-label={`${snapshot.data.totals.additions} additions, ${snapshot.data.totals.deletions} removals`}
							>
								<span className="text-added">+{snapshot.data.totals.additions}</span>
								<span className="text-removed">−{snapshot.data.totals.deletions}</span>
							</div>
						)}
						<button
							type="button"
							className="-m-1 p-1 text-secondary hover:text-primary"
							onClick={onClose}
							aria-label="Close review"
						>
							<XMarkIcon className="size-4" />
						</button>
					</div>
				</div>

				<div ref={diff} className="min-h-0 flex-1 overflow-auto">
					<ReviewBody
						snapshot={snapshot}
						projectId={project.id}
						mode={mode}
						closedFiles={closedFiles}
						fullFiles={fullFiles}
						sections={sections.current}
						onToggleOpen={(path) => setClosedFiles((current) => toggledSet(current, path))}
						onToggleFull={toggleFullFile}
					/>
				</div>
			</div>
		</aside>
	);
}

function ReviewBody({
	snapshot,
	projectId,
	mode,
	closedFiles,
	fullFiles,
	sections,
	onToggleOpen,
	onToggleFull,
}: {
	snapshot: UseQueryResult<ReviewSnapshot>;
	projectId: string;
	mode: ReviewMode;
	closedFiles: ReadonlySet<string>;
	fullFiles: ReadonlySet<string>;
	sections: Map<string, HTMLElement | null>;
	onToggleOpen: (path: string) => void;
	onToggleFull: (path: string) => void;
}) {
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

	return snapshot.data.files.map((file) => (
		<ReviewFile
			key={file.path}
			file={file}
			projectId={projectId}
			mode={mode}
			open={!closedFiles.has(file.path)}
			full={fullFiles.has(file.path)}
			sections={sections}
			onToggleOpen={onToggleOpen}
			onToggleFull={onToggleFull}
		/>
	));
}

function ReviewFile({
	file,
	projectId,
	mode,
	open,
	full,
	sections,
	onToggleOpen,
	onToggleFull,
}: {
	file: FileChange;
	projectId: string;
	mode: ReviewMode;
	open: boolean;
	full: boolean;
	sections: Map<string, HTMLElement | null>;
	onToggleOpen: (path: string) => void;
	onToggleFull: (path: string) => void;
}) {
	const ChevronIcon = open ? ChevronDownIcon : ChevronRightIcon;
	const fileNameStart = file.path.lastIndexOf("/") + 1;
	const directoryPath = file.path.slice(0, fileNameStart);
	const fileName = file.path.slice(fileNameStart);
	const fullFile = useQuery(
		orpc.review.fullFile.queryOptions({
			input: { projectId, path: file.path, mode },
			enabled: open && full,
			refetchInterval: (query) => (query.state.data?.status === "too-large" ? false : 2000),
			placeholderData: keepPreviousData,
		}),
	);

	return (
		<section
			className="border-outline border-b"
			aria-label={file.path}
			ref={(node) => {
				sections.set(file.path, node);
				return () => {
					sections.delete(file.path);
				};
			}}
		>
			<header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface-raised px-3 py-2 text-data">
				<span className="flex min-w-0 items-center gap-2">
					<span className="shrink-0 text-secondary">{STATUS_MARK[file.status]}</span>
					<button
						type="button"
						className="group -m-1 flex min-w-0 items-center gap-2 p-1 text-left text-body"
						aria-expanded={open}
						aria-label={`${open ? "Close" : "Open"} ${file.path}`}
						onClick={() => onToggleOpen(file.path)}
					>
						<span className="flex min-w-0 group-hover:underline">
							<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
							<span className="shrink-0 text-primary">{fileName}</span>
						</span>
						<ChevronIcon className="size-4 shrink-0 text-secondary group-hover:text-primary" />
					</button>
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
						className={`-m-1 p-1 hover:text-primary ${full ? "text-tertiary" : "text-secondary"}`}
						aria-pressed={full}
						aria-label={`${full ? "Collapse" : "Expand"} ${file.path} to the full file`}
						onClick={() => onToggleFull(file.path)}
					>
						<ArrowsPointingOutIcon className="size-4" />
					</button>
				</span>
			</header>
			{open && <ReviewFileBody file={file} full={full} fullFile={fullFile} />}
		</section>
	);
}

function ReviewFileBody({
	file,
	full,
	fullFile,
}: {
	file: FileChange;
	full: boolean;
	fullFile: UseQueryResult<FullFile>;
}) {
	if (!full) {
		return <DiffLines lines={file.lines} />;
	}
	if (fullFile.data?.status === "too-large") {
		return <ReviewNotice>{`Too large to show in full: ${fullFile.data.lineCount} lines.`}</ReviewNotice>;
	}
	if (fullFile.data) {
		return <DiffLines lines={fullFile.data.lines} />;
	}
	if (fullFile.isError) {
		return <ReviewNotice>{String(fullFile.error)}</ReviewNotice>;
	}

	return <ReviewNotice>Reading file…</ReviewNotice>;
}

function DiffLines({ lines }: { lines: DiffLine[] }) {
	if (lines.length === 0) {
		return null;
	}

	return (
		<div className="pb-1">
			{lines.map((line, index) => (
				<div className={`flex min-w-full w-max text-code ${DIFF_INK[line.kind]}`} key={index}>
					<span className="sticky left-0 w-10 shrink-0 select-none border-outline border-r bg-surface-sunken pr-2 text-right text-secondary">{line.number}</span>
					<code className="whitespace-pre">
						{DIFF_MARKERS[line.kind]} {line.content}
					</code>
				</div>
			))}
		</div>
	);
}

function ReviewNotice({ children }: { children: string }) {
	return <div className="px-3 py-3 text-data text-secondary">{children}</div>;
}
