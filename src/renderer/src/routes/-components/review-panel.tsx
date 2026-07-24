import { ChevronDownIcon, ChevronUpIcon, FolderIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import type { ReviewMode } from "@main/git/contracts";
import type { Project } from "@main/store/projects";
import { ReviewDiff, type ReviewDiffHandle } from "@renderer/routes/-components/review-diff";
import { ReviewFocusedFile } from "@renderer/routes/-components/review-focused-file";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import { REVIEW_DIFF_WIDTH_VALUE } from "@renderer/routes/-utils/review-layout";
import { REVIEW_SCOPES } from "@renderer/routes/-utils/review-scope";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";
import type { useDivider } from "@renderer/routes/-utils/use-divider";
import { useReviewReading } from "@renderer/routes/-utils/use-review-reading";

export function ReviewPanel({
	project,
	shellId,
	minDiffWidth,
	treeOpen,
	treeDivider,
	onTreeOpenChange,
	onClose,
}: {
	project: Project;
	shellId?: string;
	minDiffWidth: number;
	treeOpen: boolean;
	treeDivider: ReturnType<typeof useDivider>;
	onTreeOpenChange: (open: boolean) => void;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<ReviewMode>("uncommitted");
	const [closedFiles, setClosedFiles] = useState<ReadonlySet<string>>(new Set());
	const [focusedPath, setFocusedPath] = useState<string>();
	const diff = useRef<ReviewDiffHandle>(null);
	const isFileOpen = useCallback((path: string) => !closedFiles.has(path), [closedFiles]);
	const { generation, fullFile, error, refreshing } = useReviewReading({
		projectId: project.id,
		mode,
		shellId,
		isFileOpen,
		focusedPath,
	});

	const selectMode = useCallback((next: ReviewMode) => {
		setMode(next);
		setFocusedPath(undefined);
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

	const closeFocus = useCallback(() => {
		setFocusedPath(undefined);
		// Imperative scroll: the overlay uncovers the diff, so put the reading position back where it was.
		requestAnimationFrame(() => diff.current?.restoreReadingPosition());
	}, []);

	const toggleFocus = useCallback(
		(path: string) => {
			if (focusedPath === path) {
				closeFocus();
				return;
			}
			setFocusedPath(path);
		},
		[focusedPath, closeFocus],
	);

	const openFromTree = useCallback(
		(path: string) => {
			if (focusedPath) {
				setFocusedPath(path);
				return;
			}
			revealFile(path);
		},
		[focusedPath, revealFile],
	);

	const currentSnapshot = generation?.snapshot;
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
		<aside className="flex bg-surface-raised" aria-label="Review">
			{treeOpen && (
				<ReviewTree
					key={mode}
					files={files}
					focusedPath={focusedPath}
					divider={treeDivider}
					onOpenFile={openFromTree}
					onToggleFocusFile={toggleFocus}
				/>
			)}

			<div style={{ width: REVIEW_DIFF_WIDTH_VALUE, minWidth: minDiffWidth }} className="flex flex-col">
				<div className="flex h-header shrink-0 items-center justify-between border-outline border-b">
					<div className="flex h-full min-w-0 overflow-hidden">
						<button
							type="button"
							className={`flex h-full w-header shrink-0 items-center justify-center border-outline border-r hover:bg-surface-hover hover:text-primary ${
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
							{REVIEW_SCOPES.map((option) => (
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
						{refreshing && (
							<span
								role="status"
								aria-label="Reading new changes"
								title="Reading new changes"
								className="review-refreshing size-[6px] shrink-0 rounded-full bg-secondary"
							/>
						)}
						{currentSnapshot?.state === "ready" && (
							<div
								className="flex gap-2 text-data"
								aria-label={`${currentSnapshot.totals.additions} additions, ${currentSnapshot.totals.deletions} removals`}
							>
								<span className="text-added">+{currentSnapshot.totals.additions}</span>
								<span className="text-removed">−{currentSnapshot.totals.deletions}</span>
							</div>
						)}
						{currentSnapshot?.state === "ready" && (
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
						key={mode}
						ref={diff}
						mode={mode}
						generation={generation}
						error={error}
						covered={!!focusedFile}
						closedFiles={closedFiles}
						onToggleOpen={toggleOpen}
						onFocusFile={setFocusedPath}
					/>
					{focusedFile && (
						<ReviewFocusedFile
							key={focusedFile.path}
							content={fullFile}
							file={focusedFile}
							onClose={closeFocus}
						/>
					)}
				</div>
			</div>
		</aside>
	);
}
