import { useMemo } from "react";
import type { FileChange } from "@main/git/git-contracts";
import {
	ReviewTreeDirectoryRow,
	ReviewTreeFileRow,
	type ReviewTreeItem,
} from "@renderer/routes/-components/review-tree-rows";
import { fileTree, fileTreeDirectories, fileTreeRows } from "@renderer/routes/-utils/file-tree";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

export function ReviewTreeBrowse({
	paths,
	files,
	focusedPath,
	expanded,
	onExpandedChange,
	onOpenFile,
}: {
	paths?: string[];
	files: FileChange[];
	focusedPath?: string;
	expanded: ReadonlySet<string>;
	onExpandedChange: (expanded: ReadonlySet<string>) => void;
	onOpenFile: (path: string) => void;
}) {
	const tree = useMemo(() => {
		const changed = new Map(files.map((file) => [file.path, file]));

		return fileTree<ReviewTreeItem>((paths ?? []).map((path) => ({ path, item: changed.get(path) })));
	}, [paths, files]);
	const collapsed = useMemo(
		() => new Set(fileTreeDirectories(tree).filter((path) => !expanded.has(path))),
		[tree, expanded],
	);

	if (!paths) {
		return <div className="px-3 py-1 text-body text-secondary">Reading files…</div>;
	}

	return (
		<>
			{fileTreeRows(tree, collapsed).map((row) =>
				row.node.kind === "directory" ? (
					<ReviewTreeDirectoryRow
						key={row.node.path}
						node={row.node}
						depth={row.depth}
						collapsed={collapsed.has(row.node.path)}
						onToggle={(node) => onExpandedChange(toggledSet(expanded, node.path))}
					/>
				) : (
					<ReviewTreeFileRow
						key={row.node.path}
						node={row.node}
						depth={row.depth}
						focused={row.node.path === focusedPath}
						onOpen={onOpenFile}
					/>
				)
			)}
		</>
	);
}
