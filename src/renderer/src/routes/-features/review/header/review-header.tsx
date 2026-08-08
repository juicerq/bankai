import {
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FolderIcon,
} from "@heroicons/react/24/outline";
import type { ReviewMode } from "@shared/review";
import { ReviewScope } from "@renderer/routes/-features/review/header/review-scope-menu";
import { ReviewWorktree, type ReviewWorktreeSelection } from "@renderer/routes/-features/review/header/review-worktree-menu";

export function ReviewHeader({
	mode,
	sharedWith,
	worktrees,
	totals,
	refreshing,
	treeOpen,
	expanded,
	filesClosed,
	onSelectMode,
	onTreeOpenChange,
	onToggleExpanded,
	onToggleAllFiles,
}: {
	mode: ReviewMode;
	sharedWith: string[];
	worktrees: ReviewWorktreeSelection;
	totals: { additions: number; deletions: number } | undefined;
	refreshing: boolean;
	treeOpen: boolean;
	expanded: boolean;
	filesClosed: boolean;
	onSelectMode: (mode: ReviewMode) => void;
	onTreeOpenChange: (open: boolean) => void;
	onToggleExpanded: () => void;
	onToggleAllFiles: () => void;
}) {
	const allFilesAction = filesClosed ? "Expand all files" : "Collapse all files";
	const expandAction = expanded ? "Dock review panel" : "Expand review panel";

	return (
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
				<ReviewScope mode={mode} sharedWith={sharedWith} onSelect={onSelectMode} />
				<ReviewWorktree {...worktrees} />
			</div>
			<div className="flex h-full shrink-0 items-center">
				{(refreshing || totals) && (
					<div className="flex shrink-0 items-center gap-2 px-3">
						{refreshing && (
							<span
								role="status"
								aria-label="Reading new changes"
								title="Reading new changes"
								className="pending-pulse size-[6px] shrink-0 rounded-full bg-secondary"
							/>
						)}
						{totals && (
							<>
								<div
									className="flex gap-2 text-data"
									aria-label={`${totals.additions} additions, ${totals.deletions} removals`}
								>
									<span className="text-added">+{totals.additions}</span>
									<span className="text-removed">−{totals.deletions}</span>
								</div>
								<button
									type="button"
									className="-m-1 p-1 text-secondary hover:text-primary"
									onClick={onToggleAllFiles}
									aria-label={allFilesAction}
									title={allFilesAction}
								>
									{filesClosed ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
								</button>
							</>
						)}
					</div>
				)}
				<button
					type="button"
					data-component="review-expand"
					data-expanded={expanded}
					className={`flex h-full w-header shrink-0 items-center justify-center border-outline border-l hover:bg-surface-hover hover:text-primary ${
						expanded ? "bg-surface-active text-primary" : "text-secondary"
					}`}
					aria-pressed={expanded}
					aria-label={expandAction}
					title={`${expandAction} (Ctrl+X E)`}
					onClick={onToggleExpanded}
				>
					{expanded ? <ArrowsPointingInIcon className="size-4" /> : <ArrowsPointingOutIcon className="size-4" />}
				</button>
			</div>
		</div>
	);
}
