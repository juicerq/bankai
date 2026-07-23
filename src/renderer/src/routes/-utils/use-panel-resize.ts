import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

const REVIEW_DIFF_WIDTH_PROPERTY = "--review-diff-width";
export const REVIEW_DIFF_WIDTH_VALUE = `var(${REVIEW_DIFF_WIDTH_PROPERTY})`;
const REVIEW_TREE_WIDTH_PROPERTY = "--review-tree-width";
export const REVIEW_TREE_WIDTH_VALUE = `var(${REVIEW_TREE_WIDTH_PROPERTY})`;

interface PanelWidths { width: number; treeWidth: number }

export function usePanelResize(options: {
	initialWidth: number;
	minWidth: number;
	terminalReserve: number;
	tree?: { width: number; minWidth: number; onSqueeze: (width: number) => void };
}) {
	const [width, setWidth] = useState(options.initialWidth);
	const [resizing, setResizing] = useState(false);
	const [rowWidth, setRowWidth] = useState<number>();
	const row = useRef<HTMLDivElement | null>(null);
	const dragStart = useRef<(PanelWidths & { x: number }) | null>(null);
	const pending = useRef<PanelWidths | null>(null);

	const treePreferred = options.tree?.width ?? 0;
	const treeMin = options.tree?.minWidth ?? 0;
	const maxWidth = rowWidth === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(options.minWidth, rowWidth - options.terminalReserve - treePreferred);
	const clampWidth = (next: number) => Math.min(Math.max(next, options.minWidth), maxWidth);
	const renderedWidth = clampWidth(width);
	const treeWidth = rowWidth === undefined
		? treePreferred
		: Math.min(treePreferred, Math.max(treeMin, rowWidth - renderedWidth - options.terminalReserve));

	const squeeze = (clientX: number): PanelWidths | null => {
		const start = dragStart.current;
		if (!start) {
			return null;
		}

		const proposed = start.width + start.x - clientX;
		const deficit = Math.max(0, options.minWidth - proposed);

		return { width: clampWidth(proposed), treeWidth: Math.max(treeMin, start.treeWidth - deficit) };
	};

	const applyVars = (next: PanelWidths) => {
		row.current?.style.setProperty(REVIEW_DIFF_WIDTH_PROPERTY, `${next.width}px`);
		row.current?.style.setProperty(REVIEW_TREE_WIDTH_PROPERTY, `${next.treeWidth}px`);
	};

	const rowRef = useCallback((element: HTMLDivElement | null) => {
		row.current = element;
		if (!element) {
			return;
		}

		element.style.setProperty(REVIEW_DIFF_WIDTH_PROPERTY, `${renderedWidth}px`);
		element.style.setProperty(REVIEW_TREE_WIDTH_PROPERTY, `${treeWidth}px`);
		const observer = new ResizeObserver(() => setRowWidth(element.clientWidth));
		setRowWidth(element.clientWidth);
		observer.observe(element);

		return () => observer.disconnect();
	}, [renderedWidth, treeWidth]);

	const finish = (next: PanelWidths) => {
		applyVars(next);
		setWidth(next.width);
		if (options.tree && next.treeWidth !== treeWidth) {
			options.tree.onSqueeze(next.treeWidth);
		}

		pending.current = null;
		dragStart.current = null;
		setResizing(false);
	};

	const separatorProps = {
		onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			dragStart.current = { x: event.clientX, width: renderedWidth, treeWidth };
			setResizing(true);
		},
		onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
			const next = squeeze(event.clientX);
			if (!next) {
				return;
			}

			pending.current = next;
			applyVars(next);
		},
		onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
			finish(squeeze(event.clientX) ?? { width: renderedWidth, treeWidth });
		},
		onPointerCancel: () => {
			finish(pending.current ?? { width: renderedWidth, treeWidth });
		},
	};

	return {
		width: renderedWidth,
		treeWidth,
		setPreferredWidth: setWidth,
		rowWidth,
		resizing,
		rowRef,
		separatorProps,
	};
}
