import { afterEach, expect, test } from "bun:test";
import { useCallback, useState } from "react";
import { usePanelResize } from "@renderer/routes/-utils/use-panel-resize";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function PanelResizeHarness() {
	const resize = usePanelResize({
		initialWidth: 810,
		minWidth: 280,
		terminalReserve: 560,
	});

	return (
		<main data-component="panel-resize" data-width={resize.width} data-resizing={resize.resizing}>
			<div data-component="panel-resize-handle" {...resize.separatorProps} />
		</main>
	);
}

function TreeResizeHarness({ rowWidth, onSqueeze }: { rowWidth: number; onSqueeze: (width: number) => void }) {
	const [tree, setTree] = useState(300);
	const resize = usePanelResize({
		initialWidth: 400,
		minWidth: 280,
		terminalReserve: 360,
		tree: {
			width: tree,
			minWidth: 120,
			onSqueeze: (width) => {
				setTree(width);
				onSqueeze(width);
			},
		},
	});
	const setRow = useCallback(
		(element: HTMLDivElement | null) => {
			if (element) {
				Object.defineProperty(element, "clientWidth", { configurable: true, value: rowWidth });
			}

			return resize.rowRef(element);
		},
		[resize.rowRef, rowWidth],
	);

	return (
		<div data-component="panel-resize" data-width={resize.width} data-tree-width={resize.treeWidth} ref={setRow}>
			<div data-component="panel-resize-handle" {...resize.separatorProps} />
		</div>
	);
}

test("commits the pointer release position even when movement outruns rendering", () => {
	render(<PanelResizeHarness />);

	const handle = get("panel-resize-handle");
	fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 });
	fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });

	expect(get("panel-resize").dataset.width).toBe("1210");
	expect(get("panel-resize").dataset.resizing).toBe("false");
});

test("squeezes the tree once the diff floors and commits the squeezed width", () => {
	let squeezed: number | undefined;
	render(<TreeResizeHarness rowWidth={2000} onSqueeze={(width) => (squeezed = width)} />);

	const handle = get("panel-resize-handle");
	fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
	fireEvent.pointerUp(handle, { clientX: 720, pointerId: 1 });

	expect(get("panel-resize").dataset.width).toBe("280");
	expect(squeezed).toBe(200);
});

test("floors the squeezed tree at its minimum width", () => {
	let squeezed: number | undefined;
	render(<TreeResizeHarness rowWidth={2000} onSqueeze={(width) => (squeezed = width)} />);

	const handle = get("panel-resize-handle");
	fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
	fireEvent.pointerUp(handle, { clientX: 900, pointerId: 1 });

	expect(get("panel-resize").dataset.width).toBe("280");
	expect(squeezed).toBe(120);
});

test("a reversal within one drag restores the tree before growing the diff", () => {
	render(<TreeResizeHarness rowWidth={2000} onSqueeze={() => {}} />);

	const handle = get("panel-resize-handle");
	const row = get("panel-resize");
	fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });

	fireEvent.pointerMove(handle, { clientX: 720, pointerId: 1 });
	expect(row.style.getPropertyValue("--review-tree-width")).toBe("200px");
	expect(row.style.getPropertyValue("--review-diff-width")).toBe("280px");

	fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
	expect(row.style.getPropertyValue("--review-tree-width")).toBe("300px");
	expect(row.style.getPropertyValue("--review-diff-width")).toBe("500px");

	fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });
});
