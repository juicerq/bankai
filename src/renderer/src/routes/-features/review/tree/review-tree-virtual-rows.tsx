import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback } from "react";
import type { FileTreeRow } from "@renderer/routes/-features/review/tree/file-tree";

export const TREE_ROW_HEIGHT = 24;

const TREE_ROW_OVERSCAN = 24;

export function ReviewTreeVirtualRows<T>({
	rows,
	highlightedPath,
	scrollElement,
	initialOffset,
	children,
}: {
	rows: FileTreeRow<T>[];
	highlightedPath?: string;
	scrollElement: HTMLDivElement | null;
	initialOffset: number;
	children: (row: FileTreeRow<T>) => ReactNode;
}) {
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollElement,
		estimateSize: () => TREE_ROW_HEIGHT,
		initialOffset,
		overscan: TREE_ROW_OVERSCAN,
	});
	const highlightedIndex = rows.findIndex(
		(row) => row.node.kind === "file" && row.node.path === highlightedPath,
	);
	const revealHighlightedRow = useCallback((node: HTMLDivElement | null) => {
		if (!node) {
			return;
		}

		const frame = requestAnimationFrame(() => {
			if (node.isConnected) {
				node.scrollIntoView({ block: "nearest" });
			}
		});

		return () => cancelAnimationFrame(frame);
	}, []);

	return (
		<div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
			{highlightedIndex >= 0 && (
				<div
					key={`${highlightedPath}:${highlightedIndex}`}
					ref={revealHighlightedRow}
					data-slot="highlighted-marker"
					data-path={highlightedPath}
					aria-hidden="true"
					className="pointer-events-none invisible absolute left-0 w-px"
					style={{ top: highlightedIndex * TREE_ROW_HEIGHT, height: TREE_ROW_HEIGHT }}
				/>
			)}
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
						{children(row)}
					</div>
				);
			})}
		</div>
	);
}
