import { useMemo } from "react";
import type { FileChange } from "@main/git/git-contracts";
import {
	ReviewTreeDirectoryRow,
	ReviewTreeFileRow,
	type ReviewTreeItem,
} from "@renderer/routes/-components/review-tree-rows";
import { type FileTreeDirectory, fileTree, fileTreePaths, fileTreeRows } from "@renderer/routes/-utils/file-tree";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

export function ReviewTreeChanges({
	files,
	focusedPath,
	collapsed,
	onCollapsedChange,
	onOpenFile,
	onToggleFocusFile,
	onCloseFiles,
}: {
	files: FileChange[];
	focusedPath?: string;
	collapsed: ReadonlySet<string>;
	onCollapsedChange: (collapsed: ReadonlySet<string>) => void;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
	onCloseFiles: (paths: string[], closed: boolean) => void;
}) {
	const tree = useMemo(
		() => fileTree<ReviewTreeItem>(files.map((file) => ({ path: file.path, item: file }))),
		[files],
	);

	const toggleDirectory = (node: FileTreeDirectory<ReviewTreeItem>) => {
		onCollapsedChange(toggledSet(collapsed, node.path));
		onCloseFiles(fileTreePaths(node), !collapsed.has(node.path));
	};

	return (
		<>
			{fileTreeRows(tree, collapsed).map((row) =>
				row.node.kind === "directory" ? (
					<ReviewTreeDirectoryRow
						key={row.node.path}
						node={row.node}
						depth={row.depth}
						collapsed={collapsed.has(row.node.path)}
						onToggle={toggleDirectory}
					/>
				) : (
					<ReviewTreeFileRow
						key={row.node.path}
						node={row.node}
						depth={row.depth}
						focused={row.node.path === focusedPath}
						onOpen={onOpenFile}
						onToggleFocus={onToggleFocusFile}
					/>
				)
			)}
		</>
	);
}
