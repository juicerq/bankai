import {
	ReviewTreeDirectoryRow,
	ReviewTreeFileRow,
	type ReviewTreeItem,
} from "@renderer/routes/-features/review/tree/review-tree-rows";
import {
	type FileTreeDirectory,
	fileTreePaths,
	type FileTreeRow,
} from "@renderer/routes/-features/review/tree/file-tree";
import { toggledSet } from "@renderer/routes/-features/shared/interaction/toggled-set";
import { ReviewTreeVirtualRows } from "@renderer/routes/-features/review/tree/review-tree-virtual-rows";

export function ReviewTreeChanges({
	rows,
	filtering,
	filterCollapsed,
	focusedPath,
	highlightedPath,
	collapsed,
	onCollapsedChange,
	onFilterCollapsedChange,
	onOpenFile,
	onToggleFocusFile,
	onCloseFiles,
	scrollElement,
	initialOffset,
}: {
	rows: FileTreeRow<ReviewTreeItem>[];
	filtering: boolean;
	filterCollapsed: ReadonlySet<string>;
	focusedPath?: string;
	highlightedPath?: string;
	collapsed: ReadonlySet<string>;
	onCollapsedChange: (collapsed: ReadonlySet<string>) => void;
	onFilterCollapsedChange: (collapsed: ReadonlySet<string>) => void;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
	onCloseFiles: (paths: string[], closed: boolean) => void;
	scrollElement: HTMLDivElement | null;
	initialOffset: number;
}) {
	const visibleCollapsed = filtering ? filterCollapsed : collapsed;

	const toggleDirectory = (node: FileTreeDirectory<ReviewTreeItem>) => {
		if (filtering) {
			onFilterCollapsedChange(toggledSet(filterCollapsed, node.path));
			return;
		}

		onCollapsedChange(toggledSet(collapsed, node.path));
		onCloseFiles(fileTreePaths(node.children), !collapsed.has(node.path));
	};

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
						collapsed={visibleCollapsed.has(row.node.path)}
						onToggle={toggleDirectory}
					/>
				) : (
					<ReviewTreeFileRow
						node={row.node}
						depth={row.depth}
						focused={row.node.path === focusedPath}
						highlighted={row.node.path === highlightedPath}
						onOpen={onOpenFile}
						onToggleFocus={onToggleFocusFile}
					/>
				)
			}
		</ReviewTreeVirtualRows>
	);
}
