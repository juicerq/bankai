import { afterEach, describe, expect, test } from "bun:test";
import { useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import { ProjectRail } from "@renderer/routes/-components/project-rail";
import { ProjectRailFrame } from "@renderer/routes/-components/project-rail-frame";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import {
	DEFAULT_RAIL_WIDTH,
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-utils/rail-layout";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

const projects: Project[] = [
	{ id: "bankai", name: "bankai", path: "/projects/bankai", createdAt: 1 },
	{ id: "dogama", name: "dogama", path: "/projects/dogama", createdAt: 2 },
];

afterEach(() => {
	cleanup();
});

function ProjectRailHarness() {
	const [selectedId, setSelectedId] = useState("bankai");
	const [focusRequests, setFocusRequests] = useState(0);
	const projectRail = useFullscreenProjectRail(() => setFocusRequests((current) => current + 1));
	const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
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
			<button type="button" data-component="picker-release" onClick={() => projectRail.setPickerActive(false)} />
			<span data-component="shell-focus-requests" data-count={focusRequests} />
			<span data-component="rail-width" data-value={railWidth} />
			<ProjectRailFrame
				projectRail={projectRail}
				divider={railDivider}
				frameRef={railFrameRef}
				railWidth={railWidth}
			>
				<ProjectRail
					projects={projects}
					activity={new Map()}
					loading={false}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onAdd={() => projectRail.setPickerActive(true)}
					onOpenDirectory={() => {}}
					onRemove={() => {}}
					onMove={() => {}}
					adding={false}
					addFailed={false}
					onMenuOpenChange={projectRail.setMenuOpen}
					onDragActiveChange={projectRail.setDragging}
				/>
			</ProjectRailFrame>
		</main>
	);
}

function enterFullscreen(pointerX = 20) {
	fireEvent.pointerMove(window, { clientX: pointerX });
	fireEvent.click(get("fullscreen-toggle"));
}

function revealFromEdge() {
	fireEvent.pointerMove(window, { clientX: 20 });
	fireEvent.pointerEnter(get("project-rail-activation"));
}

describe("fullscreen Project rail", () => {
	test("keeps the real rail fixed outside fullscreen", () => {
		render(<ProjectRailHarness />);

		const frame = get("project-rail-frame");
		const workspaceLayout = get("project-workspace-layout");

		expect(frame.dataset.fullscreen).toBe("false");
		expect(frame.dataset.revealed).toBe("true");
		expect(frame.dataset.motionDuration).toBe(String(LAYOUT_MOTION_DURATION_MS));
		expect(workspaceLayout.dataset.fullscreen).toBe("false");
		expect(workspaceLayout.dataset.motionDuration).toBe(String(LAYOUT_MOTION_DURATION_MS));
		expect(frame.inert).toBe(false);
		expect(get("project-rail")).toBeDefined();
	});

	test("requires a fresh edge entry when fullscreen starts under the pointer", () => {
		render(<ProjectRailHarness />);

		enterFullscreen(4);

		const frame = get("project-rail-frame");
		const workspaceLayout = get("project-workspace-layout");
		expect(frame.dataset.revealed).toBe("false");
		expect(workspaceLayout.dataset.fullscreen).toBe("true");
		expect(workspaceLayout.dataset.animating).toBe("true");
		expect(frame.inert).toBe(true);

		const widthTransition = new Event("transitionend", { bubbles: true });
		Object.defineProperty(widthTransition, "propertyName", { value: "width" });
		fireEvent(workspaceLayout, widthTransition);
		expect(workspaceLayout.dataset.animating).toBe("false");

		fireEvent.pointerEnter(get("project-rail-activation"));
		expect(frame.dataset.revealed).toBe("false");

		revealFromEdge();
		expect(frame.dataset.revealed).toBe("true");
		expect(frame.inert).toBe(false);
	});

	test("withdraws immediately when the pointer leaves", () => {
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.pointerLeave(frame);
		expect(frame.dataset.revealed).toBe("false");
		expect(frame.inert).toBe(true);
	});

	test("selection and focus keep the rail available until interaction leaves it", () => {
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		const item = get("project-rail-item", { projectId: "dogama" });
		fireEvent.click(item);
		expect(frame.dataset.revealed).toBe("true");
		expect(item.getAttribute("aria-pressed")).toBe("true");

		const addProject = slot(get("project-rail"), "add-project");
		fireEvent.focus(addProject);
		fireEvent.pointerLeave(frame);
		expect(frame.dataset.revealed).toBe("true");

		fireEvent.blur(addProject, { relatedTarget: get("fullscreen-toggle") });
		expect(frame.dataset.revealed).toBe("false");
	});

	test("menu and reorder activity hold the rail open", () => {
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		const item = get("project-rail-item", { projectId: "bankai" });
		fireEvent.contextMenu(item, { clientX: 40, clientY: 40 });
		fireEvent.pointerLeave(frame);
		expect(frame.dataset.revealed).toBe("true");
		expect(get("project-rail-menu")).toBeDefined();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(query("project-rail-menu")).toBeNull();
		expect(frame.dataset.revealed).toBe("false");

		revealFromEdge();
		fireEvent.dragStart(item, { dataTransfer: { effectAllowed: "none", dropEffect: "none" } });
		fireEvent.pointerLeave(frame);
		expect(frame.dataset.revealed).toBe("true");

		fireEvent.dragEnd(item);
		expect(frame.dataset.revealed).toBe("false");
	});

	test("entering fullscreen closes an open rail menu and requests Shell focus", () => {
		render(<ProjectRailHarness />);

		fireEvent.contextMenu(get("project-rail-item", { projectId: "bankai" }), { clientX: 40, clientY: 40 });
		expect(get("project-rail-menu")).toBeDefined();

		enterFullscreen();

		expect(query("project-rail-menu")).toBeNull();
		expect(get("shell-focus-requests").dataset.count).toBe("1");
		expect(get("project-rail-frame").dataset.revealed).toBe("false");
	});

	test("native picker activity survives window blur", () => {
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.click(slot(get("project-rail"), "add-project"));
		fireEvent.blur(window);
		expect(frame.dataset.revealed).toBe("true");

		fireEvent.click(get("picker-release"));
		fireEvent.pointerLeave(frame);
		expect(frame.dataset.revealed).toBe("false");
	});

	test("window blur withdraws the rail and exiting fullscreen restores it immediately", () => {
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.blur(window);
		expect(frame.dataset.revealed).toBe("false");

		fireEvent.click(get("fullscreen-toggle"));
		expect(frame.dataset.fullscreen).toBe("false");
		expect(frame.dataset.revealed).toBe("true");
		expect(frame.inert).toBe(false);
	});

	test("entering fullscreen from a rail control requests Shell focus", () => {
		render(<ProjectRailHarness />);

		act(() => slot(get("project-rail"), "add-project").focus());
		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.click(get("fullscreen-toggle"));

		expect(get("shell-focus-requests").dataset.count).toBe("1");
	});
});
