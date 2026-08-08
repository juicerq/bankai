import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo } from "react";
import type { FileChange } from "@main/git/git-contracts";
import {
	ReviewTreeDirectoryRow,
	ReviewTreeFileRow,
	type ReviewTreeItem,
} from "@renderer/routes/-components/review-tree-rows";
import { fileTree, fileTreeDirectories, fileTreeRows } from "@renderer/routes/-utils/file-tree";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";

export const BROWSE_ROW_HEIGHT = 24;

const BROWSE_ROW_OVERSCAN = 24;

export function ReviewTreeBrowse({
	paths,
	files,
	focusedPath,
	expanded,
	scrollElement,
	initialOffset,
	onExpandedChange,
	onToggleFocus,
}: {
	paths?: string[];
	files: FileChange[];
	focusedPath?: string;
	expanded: ReadonlySet<string>;
	scrollElement: HTMLDivElement | null;
	initialOffset: number;
	onExpandedChange: (expanded: ReadonlySet<string>) => void;
	onToggleFocus: (path: string) => void;
}) {
	const tree = useMemo(() => {
		const changed = new Map(files.map((file) => [file.path, file]));

		return fileTree<ReviewTreeItem>((paths ?? []).map((path) => ({ path, item: changed.get(path) })));
	}, [paths, files]);
	const collapsed = useMemo(
		() => new Set(fileTreeDirectories(tree).filter((path) => !expanded.has(path))),
		[tree, expanded],
	);
	const rows = useMemo(() => fileTreeRows(tree, collapsed), [tree, collapsed]);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollElement,
		estimateSize: () => BROWSE_ROW_HEIGHT,
		initialOffset,
		overscan: BROWSE_ROW_OVERSCAN,
	});

	if (!paths) {
		return <div className="px-3 py-1 text-body text-secondary">Reading files…</div>;
	}

	return (
		<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
			{virtualizer.getVirtualItems().map((virtualRow) => {
				const row = rows[virtualRow.index];

				if (!row) {
					return null;
				}

				return (
					<div
						key={virtualRow.key}
						className="absolute top-0 left-0 w-full overflow-hidden"
						style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
					>
						{row.node.kind === "directory" ? (
							<ReviewTreeDirectoryRow
								node={row.node}
								depth={row.depth}
								collapsed={collapsed.has(row.node.path)}
								onToggle={(node) => onExpandedChange(toggledSet(expanded, node.path))}
							/>
						) : (
							<ReviewTreeFileRow
								node={row.node}
								depth={row.depth}
								focused={row.node.path === focusedPath}
								onOpen={onToggleFocus}
								onToggleFocus={onToggleFocus}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}
