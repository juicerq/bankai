import {
	ReviewTreeDirectoryRow,
	ReviewTreeFileRow,
	type ReviewTreeItem,
} from "@renderer/routes/-features/review/tree/review-tree-rows";
import type { FileTreeRow } from "@renderer/routes/-features/review/tree/file-tree";
import { toggledSet } from "@renderer/routes/-features/shared/interaction/toggled-set";
import { ReviewTreeVirtualRows } from "@renderer/routes/-features/review/tree/review-tree-virtual-rows";

export function ReviewTreeBrowse({
	loading,
	rows,
	filtering,
	collapsed,
	filterCollapsed,
	focusedPath,
	highlightedPath,
	expanded,
	scrollElement,
	initialOffset,
	onExpandedChange,
	onFilterCollapsedChange,
	onToggleFocus,
}: {
	loading: boolean;
	rows: FileTreeRow<ReviewTreeItem>[];
	filtering: boolean;
	collapsed: ReadonlySet<string>;
	filterCollapsed: ReadonlySet<string>;
	focusedPath?: string;
	highlightedPath?: string;
	expanded: ReadonlySet<string>;
	scrollElement: HTMLDivElement | null;
	initialOffset: number;
	onExpandedChange: (expanded: ReadonlySet<string>) => void;
	onFilterCollapsedChange: (collapsed: ReadonlySet<string>) => void;
	onToggleFocus: (path: string) => void;
}) {
	if (loading) {
		return <div className="px-3 py-1 text-body text-secondary">Reading files…</div>;
	}

	return (
		<ReviewTreeVirtualRows
			rows={rows}
			highlightedPath={highlightedPath}
			scrollElement={scrollElement}
			initialOffset={initialOffset}
		>
			{(row) =>
				row.node.kind === "directory" ? (
					<ReviewTreeDirectoryRow
						node={row.node}
						depth={row.depth}
						collapsed={collapsed.has(row.node.path)}
						onToggle={(node) => {
							if (filtering) {
								onFilterCollapsedChange(toggledSet(filterCollapsed, node.path));
								return;
							}

							onExpandedChange(toggledSet(expanded, node.path));
						}}
					/>
				) : (
					<ReviewTreeFileRow
						node={row.node}
						depth={row.depth}
						focused={row.node.path === focusedPath}
						highlighted={row.node.path === highlightedPath}
						onOpen={onToggleFocus}
						onToggleFocus={onToggleFocus}
					/>
				)
			}
		</ReviewTreeVirtualRows>
	);
}
