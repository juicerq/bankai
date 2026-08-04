import { FolderOpenIcon } from "@heroicons/react/24/outline";
import type { FileChange } from "@main/git/git-contracts";
import { Divider } from "@renderer/routes/-components/divider";
import { ReviewTreeBrowse } from "@renderer/routes/-components/review-tree-browse";
import { ReviewTreeChanges } from "@renderer/routes/-components/review-tree-changes";
import { REVIEW_TREE_WIDTH_VALUE } from "@renderer/routes/-utils/review-layout";
import type { ReviewTreeView } from "@renderer/routes/-utils/review-panel-store";
import type { useDivider } from "@renderer/routes/-utils/use-divider";

export function ReviewTree({
	files,
	browsePaths,
	treeView,
	focusedPath,
	divider,
	onToggleTreeView,
	onOpenFile,
	onToggleFocusFile,
	onCloseFiles,
}: {
	files: FileChange[];
	browsePaths?: string[];
	treeView: ReviewTreeView;
	focusedPath?: string;
	divider: ReturnType<typeof useDivider>;
	onToggleTreeView: () => void;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
	onCloseFiles: (paths: string[], closed: boolean) => void;
}) {
	const browsing = treeView === "browse";
	const viewAction = browsing ? "Show changed files" : "Browse repository files";

	return (
		<div
			data-component="review-tree"
			data-tree-view={treeView}
			data-width={divider.valueNow}
			style={{ width: REVIEW_TREE_WIDTH_VALUE }}
			className={`relative flex shrink-0 flex-col ${divider.resizing ? "cursor-col-resize select-none" : ""}`}
			aria-label="Tree"
		>
			<div className="flex h-header shrink-0 items-center justify-between border-outline border-b pr-2 pl-3 text-label text-secondary">
				<span>{browsing ? "FILES" : "TREE"}</span>
				<button
					type="button"
					data-slot="tree-view"
					className={`-m-1 p-1 hover:text-primary ${browsing ? "text-primary" : "text-secondary"}`}
					aria-pressed={browsing}
					aria-label={viewAction}
					title={viewAction}
					onClick={onToggleTreeView}
				>
					<FolderOpenIcon className="size-4" />
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				{browsing ? (
					<ReviewTreeBrowse
						paths={browsePaths}
						files={files}
						focusedPath={focusedPath}
						onOpenFile={onToggleFocusFile}
					/>
				) : (
					<ReviewTreeChanges
						files={files}
						focusedPath={focusedPath}
						onOpenFile={onOpenFile}
						onToggleFocusFile={onToggleFocusFile}
						onCloseFiles={onCloseFiles}
					/>
				)}
			</div>
			<Divider control={divider} side="right" label="Resize tree" />
		</div>
	);
}
