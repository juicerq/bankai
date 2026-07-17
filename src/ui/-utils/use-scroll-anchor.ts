import { type RefObject, useLayoutEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { anchorLineAt, type DiffRow, rowIndexForLine } from "@core/review/diff";

type FileRows = { path: string; rows: DiffRow[] };

type Anchor = { fileIndex: number; line: number | null; offset: number };

type TopChild = { fileIndex: number; rowIndex: number | null; relY: number };

function topVisibleChild(scroll: ScrollBoxRenderable, fileCount: number): TopChild | null {
	const contentY = scroll.content.y;
	const fileBoxes = scroll.content.getChildren();
	let found: TopChild | null = null;

	for (let f = 0; f < Math.min(fileBoxes.length, fileCount); f++) {
		const children = fileBoxes[f]!.getChildren();

		for (let c = 0; c < children.length; c++) {
			const relY = children[c]!.y - contentY;

			if (relY > scroll.scrollTop) {
				return found;
			}

			found = { fileIndex: f, rowIndex: c === 0 ? null : c - 1, relY };
		}
	}

	return found;
}

function captureAnchor(scroll: ScrollBoxRenderable, filesRows: FileRows[]): Anchor | null {
	const found = topVisibleChild(scroll, filesRows.length);

	if (!found) {
		return null;
	}

	const offset = scroll.scrollTop - found.relY;

	if (found.rowIndex === null) {
		return { fileIndex: found.fileIndex, line: null, offset };
	}

	const rows = filesRows[found.fileIndex]!.rows;
	const line = anchorLineAt(rows, found.rowIndex);

	if (line === null) {
		return null;
	}

	const topRow = rows[found.rowIndex]!;
	const walkedPastTopRow = topRow.kind === "remove" || topRow.kind === "removed";

	return { fileIndex: found.fileIndex, line, offset: walkedPastTopRow ? 0 : offset };
}

function applyAnchor({
	scroll,
	anchor,
	filesRows,
}: {
	scroll: ScrollBoxRenderable;
	anchor: Anchor;
	filesRows: FileRows[];
}) {
	const fileBox = scroll.content.getChildren()[anchor.fileIndex];
	const rows = filesRows[anchor.fileIndex]?.rows;

	if (!fileBox || !rows) {
		return;
	}

	let target = fileBox.getLayoutNode().getComputedLayout().top;

	if (anchor.line !== null) {
		const rowIndex = rowIndexForLine(rows, anchor.line);
		const rowRenderable = rowIndex === null ? undefined : fileBox.getChildren()[rowIndex + 1];

		if (!rowRenderable) {
			return;
		}

		target += rowRenderable.getLayoutNode().getComputedLayout().top;
	}

	scroll.verticalScrollBar.scrollSize = scroll.content.getLayoutNode().getComputedLayout().height;
	scroll.scrollTop = target + anchor.offset;
}

export function useScrollAnchor({
	scroll,
	viewKey,
	filesRows,
}: {
	scroll: RefObject<ScrollBoxRenderable | null>;
	viewKey: string;
	filesRows: FileRows[];
}) {
	const renderer = useRenderer();
	const previous = useRef({ viewKey, filesRows });

	useLayoutEffect(() => {
		const scrollBox = scroll.current;
		if (!scrollBox || previous.current.viewKey === viewKey) {
			previous.current = { viewKey, filesRows };
			return;
		}

		const anchor = captureAnchor(scrollBox, previous.current.filesRows);
		previous.current = { viewKey, filesRows };
		if (!anchor) {
			return;
		}

		renderer.root.calculateLayout();
		applyAnchor({ scroll: scrollBox, anchor, filesRows });
	}, [filesRows, renderer, scroll, viewKey]);
}
