import { ChevronDownIcon, ChevronUpIcon, FolderIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { ReviewMode } from "@main/git/Git";
import type { Project } from "@main/store/projects";
import { orpc } from "@renderer/lib/api";
import { ReviewDiff, type ReviewDiffHandle } from "@renderer/routes/-components/review-diff";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

const MODES: { mode: ReviewMode; label: string }[] = [
	{ mode: "uncommitted", label: "Uncommitted" },
	{ mode: "branch", label: "Branch" },
];

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
	const diff = useRef<ReviewDiffHandle>(null);
	const { data: snapshot, error, isError } = useQuery(
		orpc.review.snapshot.queryOptions({
			input: { projectId: project.id, mode },
			enabled: active,
			refetchInterval: 2000,
			placeholderData: keepPreviousData,
		}),
	);

	const selectMode = useCallback((next: ReviewMode) => {
		setMode(next);
		setFullFiles(new Set());
	}, []);

	const revealFile = useCallback((path: string) => {
		setClosedFiles((current) => {
			const next = new Set(current);
			next.delete(path);
			return next;
		});
		diff.current?.revealFile(path);
	}, []);

	const toggleOpen = useCallback((path: string) => {
		setClosedFiles((current) => toggledSet(current, path));
	}, []);

	const toggleFull = useCallback((path: string) => {
		setFullFiles((current) => toggledSet(current, path));
	}, []);

	const files = snapshot?.files ?? [];

	const setScopeClosed = (closed: boolean) => {
		if (files.every((file) => closedFiles.has(file.path) === closed)) {
			return;
		}
		setClosedFiles((current) => {
			const next = new Set(current);
			for (const file of files) {
				if (closed) {
					next.add(file.path);
				} else {
					next.delete(file.path);
				}
			}
			return next;
		});
	};

	return (
		<aside className="flex animate-panel-in bg-surface-raised motion-reduce:animate-none" aria-label="Review">
			{treeOpen && (
				<ReviewTree
					key={mode}
					files={snapshot?.files ?? []}
					fullFiles={fullFiles}
					onOpenFile={revealFile}
					onToggleFullFile={(path) => {
						revealFile(path);
						toggleFull(path);
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
										mode === option.mode
											? "bg-surface-active text-primary"
											: "text-secondary hover:bg-surface-hover hover:text-primary"
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
						{snapshot?.isRepo && (
							<div
								className="flex gap-2 text-data"
								aria-label={`${snapshot.totals.additions} additions, ${snapshot.totals.deletions} removals`}
							>
								<span className="text-added">+{snapshot.totals.additions}</span>
								<span className="text-removed">−{snapshot.totals.deletions}</span>
							</div>
						)}
						{snapshot?.isRepo && (
							<div className="flex items-center" role="group" aria-label="Collapse or expand all files">
								<button
									type="button"
									className="p-1 text-secondary hover:text-primary"
									onClick={() => setScopeClosed(true)}
									aria-label="Collapse all files"
									title="Collapse all files"
								>
									<ChevronUpIcon className="size-4" />
								</button>
								<button
									type="button"
									className="p-1 text-secondary hover:text-primary"
									onClick={() => setScopeClosed(false)}
									aria-label="Expand all files"
									title="Expand all files"
								>
									<ChevronDownIcon className="size-4" />
								</button>
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

				<ReviewDiff
					ref={diff}
					snapshot={snapshot}
					error={isError ? String(error) : undefined}
					projectId={project.id}
					mode={mode}
					closedFiles={closedFiles}
					fullFiles={fullFiles}
					onToggleOpen={toggleOpen}
					onToggleFull={toggleFull}
				/>
			</div>
		</aside>
	);
}
