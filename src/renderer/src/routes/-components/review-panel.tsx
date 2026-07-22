import { ChevronDownIcon, ChevronUpIcon, FolderIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { ReviewMode } from "@main/git/contracts";
import type { Project } from "@main/store/projects";
import { orpc } from "@renderer/lib/api";
import { ReviewDiff, type ReviewAnchor, type ReviewDiffHandle } from "@renderer/routes/-components/review-diff";
import { ReviewFocusedFile } from "@renderer/routes/-components/review-focused-file";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";
import { useReviewChanges } from "@renderer/routes/-utils/use-review-changes";

const MODES: { mode: ReviewMode; label: string }[] = [
	{ mode: "uncommitted", label: "Uncommitted" },
	{ mode: "branch", label: "Branch" },
];

export function ReviewPanel({
	project,
	active,
	diffWidth,
	minDiffWidth,
	treeOpen,
	defaultTreeWidth,
	treeWidth,
	minTreeWidth,
	maxTreeWidth,
	onTreeOpenChange,
	onTreeWidthChange,
	onClose,
}: {
	project: Project;
	active: boolean;
	diffWidth: number;
	minDiffWidth: number;
	treeOpen: boolean;
	defaultTreeWidth: number;
	treeWidth: number;
	minTreeWidth: number;
	maxTreeWidth?: number;
	onTreeOpenChange: (open: boolean) => void;
	onTreeWidthChange: (width: number) => void;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<ReviewMode>("uncommitted");
	const [closedFiles, setClosedFiles] = useState<ReadonlySet<string>>(new Set());
	const [focusedPath, setFocusedPath] = useState<string>();
	const diff = useRef<ReviewDiffHandle>(null);
	const anchor = useRef<ReviewAnchor | null>(null);
	const watch = useReviewChanges(project.id, active);
	const watchReady = watch.status === "ready";
	const { data: snapshot, error, isError } = useQuery(
		orpc.review.snapshot.queryOptions({
			input: { projectId: project.id, mode },
			enabled: active && watchReady,
			placeholderData: keepPreviousData,
		}),
	);

	const selectMode = useCallback((next: ReviewMode) => {
		setMode(next);
		setFocusedPath(undefined);
		anchor.current = null;
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

	const focusFile = useCallback(
		(path: string) => {
			if (!focusedPath && diff.current) {
				anchor.current = diff.current.captureAnchor();
			}
			setFocusedPath(path);
		},
		[focusedPath],
	);

	const closeFocus = useCallback(() => {
		setFocusedPath(undefined);
		const saved = anchor.current;
		anchor.current = null;
		if (saved) {
			// Imperative scroll: restore the underlying reading position after the overlay uncovers it.
			requestAnimationFrame(() => diff.current?.restoreAnchor(saved));
		}
	}, []);

	const toggleFocus = useCallback(
		(path: string) => {
			if (focusedPath === path) {
				closeFocus();
				return;
			}
			focusFile(path);
		},
		[focusedPath, closeFocus, focusFile],
	);

	const openFromTree = useCallback(
		(path: string) => {
			if (focusedPath) {
				focusFile(path);
				return;
			}
			revealFile(path);
		},
		[focusedPath, focusFile, revealFile],
	);

	const watchError = watch.status === "error" ? watch.error : undefined;
	const queryError = isError ? String(error) : undefined;
	const currentSnapshot = watch.status === "error" ? undefined : snapshot;
	const files = currentSnapshot?.files ?? [];
	const focusedFile = focusedPath ? files.find((file) => file.path === focusedPath) : undefined;
	if (focusedPath && currentSnapshot && !focusedFile) {
		// A focused path is only valid while the snapshot still contains it; drop it when the file leaves the scope.
		setFocusedPath(undefined);
	}

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
					files={files}
					focusedPath={focusedPath}
					defaultWidth={defaultTreeWidth}
					preferredWidth={treeWidth}
					minWidth={minTreeWidth}
					maxWidth={maxTreeWidth}
					onWidthChange={onTreeWidthChange}
					onOpenFile={openFromTree}
					onToggleFocusFile={toggleFocus}
				/>
			)}

			<div style={{ width: diffWidth, minWidth: minDiffWidth }} className="flex flex-col">
				<div className="flex h-header shrink-0 items-center justify-between border-outline border-b">
					<div className="flex h-full min-w-0 overflow-hidden">
						<button
							type="button"
							className={`flex size-header shrink-0 items-center justify-center border-outline border-r hover:bg-surface-hover hover:text-primary ${
								treeOpen ? "bg-surface-active text-primary" : "text-secondary"
							}`}
							aria-expanded={treeOpen}
							aria-label="Toggle file tree"
							title="Toggle file tree"
							onClick={() => onTreeOpenChange(!treeOpen)}
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
						{currentSnapshot?.isRepo && (
							<div
								className="flex gap-2 text-data"
								aria-label={`${currentSnapshot.totals.additions} additions, ${currentSnapshot.totals.deletions} removals`}
							>
								<span className="text-added">+{currentSnapshot.totals.additions}</span>
								<span className="text-removed">−{currentSnapshot.totals.deletions}</span>
							</div>
						)}
						{currentSnapshot?.isRepo && (
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

				<div className="relative flex min-h-0 flex-1 flex-col">
					<ReviewDiff
						ref={diff}
						projectId={project.id}
						mode={mode}
						active={active && watchReady}
						snapshot={currentSnapshot}
						error={watchError ?? queryError}
						covered={!!focusedFile}
						closedFiles={closedFiles}
						onToggleOpen={toggleOpen}
						onFocusFile={focusFile}
					/>
					{focusedFile && (
						<ReviewFocusedFile
							key={focusedFile.path}
							projectId={project.id}
							mode={mode}
							active={active && watchReady}
							file={focusedFile}
							onClose={closeFocus}
						/>
					)}
				</div>
			</div>
		</aside>
	);
}
