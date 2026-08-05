import { DocumentDuplicateIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { type UIEvent, useCallback, useRef, useState } from "react";
import type { FileChange } from "@main/git/git-contracts";
import { Divider } from "@renderer/routes/-components/divider";
import { ReviewTreeBrowse } from "@renderer/routes/-components/review-tree-browse";
import { ReviewTreeChanges } from "@renderer/routes/-components/review-tree-changes";
import { REVIEW_TREE_WIDTH_VALUE } from "@renderer/routes/-utils/review-layout";
import type { ReviewTreeView } from "@renderer/routes/-utils/review-panel-store";
import type { useDivider } from "@renderer/routes/-utils/use-divider";

const TREE_VIEW_SEGMENTS: {
	view: ReviewTreeView;
	label: string;
	title: string;
	icon: typeof PencilSquareIcon;
}[] = [
	{ view: "changes", label: "Diff", title: "Show changed files", icon: PencilSquareIcon },
	{ view: "browse", label: "Files", title: "Browse repository files", icon: DocumentDuplicateIcon },
];

export function ReviewTree({
	files,
	browsePaths,
	treeView,
	focusedPath,
	divider,
	onSelectTreeView,
	onOpenFile,
	onToggleFocusFile,
	onCloseFiles,
}: {
	files: FileChange[];
	browsePaths?: string[];
	treeView: ReviewTreeView;
	focusedPath?: string;
	divider: ReturnType<typeof useDivider>;
	onSelectTreeView: (view: ReviewTreeView) => void;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
	onCloseFiles: (paths: string[], closed: boolean) => void;
}) {
	const browsing = treeView === "browse";
	const [collapsedChanges, setCollapsedChanges] = useState<ReadonlySet<string>>(new Set());
	const [expandedBrowse, setExpandedBrowse] = useState<ReadonlySet<string>>(new Set());
	const scrollTops = useRef<Record<ReviewTreeView, number>>({ changes: 0, browse: 0 });

	const attachList = useCallback(
		(node: HTMLDivElement | null) => {
			if (node) {
				// Imperative scroll: the other view remounts the list, so put it back where the user left it.
				node.scrollTop = scrollTops.current[treeView];
			}
		},
		[treeView],
	);

	const trackScroll = (event: UIEvent<HTMLDivElement>) => {
		scrollTops.current[treeView] = event.currentTarget.scrollTop;
	};

	return (
		<div
			data-component="review-tree"
			data-tree-view={treeView}
			data-width={divider.valueNow}
			style={{ width: REVIEW_TREE_WIDTH_VALUE }}
			className={`relative flex shrink-0 flex-col ${divider.resizing ? "cursor-col-resize select-none" : ""}`}
			aria-label="Tree"
		>
			<div className="flex h-header shrink-0 border-outline border-b text-label">
				{TREE_VIEW_SEGMENTS.map(({ view, label, title, icon: Icon }, index) => (
					<button
						key={view}
						type="button"
						data-slot={`tree-view-${view}`}
						className={`flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-outline hover:bg-surface-hover hover:text-primary ${
							index === 0 ? "border-r" : ""
						} ${treeView === view ? "bg-surface-active text-primary" : "text-secondary"}`}
						aria-pressed={treeView === view}
						title={title}
						onClick={() => onSelectTreeView(view)}
					>
						<Icon className="size-3.5 shrink-0" aria-hidden="true" />
						{label}
					</button>
				))}
			</div>
			<div
				key={treeView}
				ref={attachList}
				onScroll={trackScroll}
				className="min-h-0 flex-1 overflow-auto"
			>
				{browsing ? (
					<ReviewTreeBrowse
						paths={browsePaths}
						files={files}
						focusedPath={focusedPath}
						expanded={expandedBrowse}
						onExpandedChange={setExpandedBrowse}
						onOpenFile={onToggleFocusFile}
					/>
				) : (
					<ReviewTreeChanges
						files={files}
						focusedPath={focusedPath}
						collapsed={collapsedChanges}
						onCollapsedChange={setCollapsedChanges}
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
