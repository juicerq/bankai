import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from "react";

export function usePanelResize(options: { initialWidth: number; minWidth: number; minRemaining: number }) {
	const [width, setWidth] = useState(options.initialWidth);
	const [resizing, setResizing] = useState(false);
	const [rowWidth, setRowWidth] = useState<number>();
	const row = useRef<HTMLDivElement | null>(null);
	const dragStart = useRef<{ x: number; width: number } | null>(null);
	const rowRef = useCallback((element: HTMLDivElement | null) => {
		row.current = element;
		if (!element) {
			return;
		}

		const observer = new ResizeObserver(() => setRowWidth(element.clientWidth));
		setRowWidth(element.clientWidth);
		observer.observe(element);

		return () => observer.disconnect();
	}, []);

	const end = () => {
		dragStart.current = null;
		setResizing(false);
	};

	const separatorProps = {
		onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			dragStart.current = { x: event.clientX, width };
			setResizing(true);
		},
		onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
			const start = dragStart.current;
			if (!start) {
				return;
			}

			const rowWidth = row.current?.clientWidth ?? Number.POSITIVE_INFINITY;
			const max = Math.max(options.minWidth, rowWidth - options.minRemaining);
			const next = start.width + (start.x - event.clientX);
			setWidth(Math.min(Math.max(next, options.minWidth), max));
		},
		onPointerUp: end,
		onPointerCancel: end,
	};

	return { width, rowWidth, resizing, rowRef, separatorProps };
}
