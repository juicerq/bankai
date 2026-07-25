import {
	ChevronDownIcon,
	ChevronUpIcon,
	EllipsisVerticalIcon,
	FolderIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import type { ReviewMode } from "@main/git/contracts";
import {
	HeaderMenu,
	HeaderMenuGroup,
	HeaderMenuItem,
	HeaderMenuSeparator,
} from "@renderer/routes/-components/header-menu";
import { ReviewScope } from "@renderer/routes/-components/review-scope";
import {
	ReviewWorktree,
	ReviewWorktreeItems,
	type ReviewWorktreeSelection,
} from "@renderer/routes/-components/review-worktree";
import { reviewHeaderControls, reviewHeaderStep } from "@renderer/routes/-utils/review-layout";
import { REVIEW_SCOPES } from "@renderer/routes/-utils/review-scope";

export function ReviewHeader({
	mode,
	worktrees,
	totals,
	refreshing,
	treeOpen,
	onSelectMode,
	onTreeOpenChange,
	onCollapseAll,
	onExpandAll,
	onClose,
}: {
	mode: ReviewMode;
	worktrees: ReviewWorktreeSelection;
	totals: { additions: number; deletions: number } | undefined;
	refreshing: boolean;
	treeOpen: boolean;
	onSelectMode: (mode: ReviewMode) => void;
	onTreeOpenChange: (open: boolean) => void;
	onCollapseAll: () => void;
	onExpandAll: () => void;
	onClose: () => void;
}) {
	const [width, setWidth] = useState<number>();

	const measure = useCallback((element: HTMLDivElement | null) => {
		if (!element) {
			return;
		}

		setWidth(reviewHeaderStep(element.clientWidth));
		const observer = new ResizeObserver(() => setWidth(reviewHeaderStep(element.clientWidth)));
		observer.observe(element);

		return () => observer.disconnect();
	}, []);

	const controls = reviewHeaderControls({
		width,
		worktrees: worktrees.worktrees.length,
		scope: REVIEW_SCOPES[mode].label,
		totals,
	});
	const worktreeInMenu = worktrees.worktrees.length >= 2 && !controls.worktree;

	return (
		<div ref={measure} className="flex h-header shrink-0 items-center justify-between border-outline border-b">
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
				<ReviewScope mode={mode} onSelect={onSelectMode} />
				{controls.worktree && <ReviewWorktree {...worktrees} />}
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
				{totals && (
					<div
						className="flex gap-2 text-data"
						aria-label={`${totals.additions} additions, ${totals.deletions} removals`}
					>
						<span className="text-added">+{totals.additions}</span>
						<span className="text-removed">−{totals.deletions}</span>
					</div>
				)}
				{controls.actions && totals && (
					<div className="flex items-center" role="group" aria-label="Collapse or expand all files">
						<button
							type="button"
							className="p-1 text-secondary hover:text-primary"
							onClick={onCollapseAll}
							aria-label="Collapse all files"
							title="Collapse all files"
						>
							<ChevronUpIcon className="size-4" />
						</button>
						<button
							type="button"
							className="p-1 text-secondary hover:text-primary"
							onClick={onExpandAll}
							aria-label="Expand all files"
							title="Expand all files"
						>
							<ChevronDownIcon className="size-4" />
						</button>
					</div>
				)}
				{controls.more && (
					<HeaderMenu
						component="review-more"
						icon={<EllipsisVerticalIcon className="size-4" aria-hidden="true" />}
						ariaLabel="More review options"
						align="end"
					>
						{worktreeInMenu && (
							<HeaderMenuGroup label="Worktree">
								<ReviewWorktreeItems {...worktrees} />
							</HeaderMenuGroup>
						)}
						{worktreeInMenu && !controls.actions && <HeaderMenuSeparator />}
						{!controls.actions && totals && (
							<>
								<HeaderMenuItem label="Collapse all files" onClick={onCollapseAll} />
								<HeaderMenuItem label="Expand all files" onClick={onExpandAll} />
							</>
						)}
						{!controls.actions && <HeaderMenuItem label="Close review" onClick={onClose} />}
					</HeaderMenu>
				)}
				{controls.actions && (
					<button
						type="button"
						className="-m-1 p-1 text-secondary hover:text-primary"
						onClick={onClose}
						aria-label="Close review"
					>
						<XMarkIcon className="size-4" />
					</button>
				)}
			</div>
		</div>
	);
}
