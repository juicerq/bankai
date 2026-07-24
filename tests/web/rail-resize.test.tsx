import { afterEach, describe, expect, test } from "bun:test";
import { useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import { ProjectRail } from "@renderer/routes/-components/project-rail";
import { ProjectRailFrame } from "@renderer/routes/-components/project-rail-frame";
import {
	DEFAULT_RAIL_WIDTH,
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-utils/rail-layout";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [
	{ id: "bankai", name: "bankai", path: "/projects/bankai", createdAt: 1 },
];

afterEach(cleanup);

function RailResizeHarness() {
	const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
	const projectRail = useFullscreenProjectRail(() => {});
	const railFrameRef = useRef<HTMLDivElement>(null);
	const railDivider = useDivider({
		value: railWidth,
		min: MIN_RAIL_WIDTH,
		max: MAX_RAIL_WIDTH,
		sign: 1,
		target: railFrameRef,
		resolve: (proposed) => {
			const { width, snap } = resolveRailWidth(proposed);

			if (projectRail.fullscreen) {
				return {
					vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
					commit: () => {
						projectRail.toggleFullscreen({ animate: false });
						setRailWidth(width);
					},
				};
			}

			return {
				vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
				commit: snap
					? () => {
						railFrameRef.current?.style.setProperty(RAIL_WIDTH_PROPERTY, `${railWidth}px`);
						projectRail.toggleFullscreen();
					}
					: () => setRailWidth(width),
			};
		},
	});

	return (
		<main>
			<button type="button" data-component="fullscreen-toggle" onClick={() => projectRail.toggleFullscreen()} />
			<span data-component="rail-width" data-value={railWidth} />
			<ProjectRailFrame projectRail={projectRail} divider={railDivider} frameRef={railFrameRef} railWidth={railWidth}>
				<ProjectRail
					projects={projects}
					activity={new Map()}
					loading={false}
					selectedId="bankai"
					onSelect={() => {}}
					onAdd={() => {}}
					onOpenDirectory={() => {}}
					onRemove={() => {}}
					onMove={() => {}}
					onMenuOpenChange={projectRail.setMenuOpen}
					onDragActiveChange={projectRail.setDragging}
				/>
			</ProjectRailFrame>
		</main>
	);
}

function handle() {
	return slot(get("project-rail-frame"), "resize");
}

function railVar() {
	return get("project-workspace-layout").style.getPropertyValue(RAIL_WIDTH_PROPERTY);
}

describe("resolveRailWidth", () => {
	test("passes a width through within bounds", () => {
		expect(resolveRailWidth(300)).toEqual({ width: 300, snap: false });
	});

	test("clamps above the maximum", () => {
		expect(resolveRailWidth(520)).toEqual({ width: MAX_RAIL_WIDTH, snap: false });
	});

	test("snaps below the minimum", () => {
		expect(resolveRailWidth(120)).toEqual({ width: MIN_RAIL_WIDTH, snap: true });
	});
});

describe("rail resize", () => {
	test("renders the rail at the default width", () => {
		render(<RailResizeHarness />);

		expect(get("rail-width").dataset.value).toBe(String(DEFAULT_RAIL_WIDTH));
		expect(railVar()).toBe(`${DEFAULT_RAIL_WIDTH}px`);
	});

	test("widening the rail commits the new width on release", () => {
		render(<RailResizeHarness />);

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerMove(handle(), { clientX: 60, pointerId: 1 });
		expect(railVar()).toBe(`${DEFAULT_RAIL_WIDTH + 60}px`);

		fireEvent.pointerUp(handle(), { clientX: 60, pointerId: 1 });
		expect(get("rail-width").dataset.value).toBe(String(DEFAULT_RAIL_WIDTH + 60));
	});

	test("clamps the width to the maximum", () => {
		render(<RailResizeHarness />);

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerUp(handle(), { clientX: 400, pointerId: 1 });

		expect(get("rail-width").dataset.value).toBe(String(MAX_RAIL_WIDTH));
	});

	test("keyboard arrows step the width", () => {
		render(<RailResizeHarness />);

		fireEvent.keyDown(handle(), { key: "ArrowRight" });
		expect(get("rail-width").dataset.value).toBe(String(DEFAULT_RAIL_WIDTH + 8));
	});

	test("dragging below the minimum snaps into fullscreen and preserves the last width", () => {
		render(<RailResizeHarness />);

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerMove(handle(), { clientX: 60, pointerId: 1 });
		fireEvent.pointerUp(handle(), { clientX: 60, pointerId: 1 });
		expect(get("rail-width").dataset.value).toBe(String(DEFAULT_RAIL_WIDTH + 60));

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerUp(handle(), { clientX: -300, pointerId: 1 });

		expect(get("project-workspace-layout").dataset.fullscreen).toBe("true");
		expect(get("rail-width").dataset.value).toBe(String(DEFAULT_RAIL_WIDTH + 60));
		expect(railVar()).toBe(`${DEFAULT_RAIL_WIDTH + 60}px`);
	});

	test("the revealed fullscreen overlay exposes the resize divider at the saved width", () => {
		render(<RailResizeHarness />);

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerUp(handle(), { clientX: 60, pointerId: 1 });

		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.click(get("fullscreen-toggle"));
		expect(get("project-rail-frame").dataset.fullscreen).toBe("true");

		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.pointerEnter(get("project-rail-activation"));

		expect(get("project-rail-frame").dataset.revealed).toBe("true");
		expect(() => handle()).not.toThrow();
		expect(railVar()).toBe(`${DEFAULT_RAIL_WIDTH + 60}px`);
	});

	test("resizing the revealed overlay docks the rail at the chosen width and exits fullscreen", () => {
		render(<RailResizeHarness />);

		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.click(get("fullscreen-toggle"));
		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.pointerEnter(get("project-rail-activation"));

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerMove(handle(), { clientX: 40, pointerId: 1 });
		expect(railVar()).toBe(`${DEFAULT_RAIL_WIDTH + 40}px`);
		fireEvent.pointerUp(handle(), { clientX: 40, pointerId: 1 });

		expect(get("project-workspace-layout").dataset.fullscreen).toBe("false");
		expect(get("project-workspace-layout").dataset.animating).toBe("false");
		expect(get("rail-width").dataset.value).toBe(String(DEFAULT_RAIL_WIDTH + 40));
		expect(railVar()).toBe(`${DEFAULT_RAIL_WIDTH + 40}px`);
	});

	test("dragging the revealed overlay below the minimum docks the rail at the minimum width", () => {
		render(<RailResizeHarness />);

		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.click(get("fullscreen-toggle"));
		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.pointerEnter(get("project-rail-activation"));

		fireEvent.pointerDown(handle(), { clientX: 0, pointerId: 1 });
		fireEvent.pointerMove(handle(), { clientX: -200, pointerId: 1 });
		expect(railVar()).toBe(`${MIN_RAIL_WIDTH}px`);
		fireEvent.pointerUp(handle(), { clientX: -200, pointerId: 1 });

		expect(get("project-workspace-layout").dataset.fullscreen).toBe("false");
		expect(get("project-workspace-layout").dataset.animating).toBe("false");
		expect(get("rail-width").dataset.value).toBe(String(MIN_RAIL_WIDTH));
		expect(railVar()).toBe(`${MIN_RAIL_WIDTH}px`);
	});
});
