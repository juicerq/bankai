import { afterEach, describe, expect, jest, test } from "bun:test";
import { useRef, useState } from "react";
import { ProjectRailFrame } from "@renderer/routes/-features/workspace/layout/project-rail-frame";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-features/workspace/layout/layout-motion";
import {
	DEFAULT_RAIL_WIDTH,
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-features/workspace/layout/rail-layout";
import { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import {
	PROJECT_RAIL_WITHDRAW_DELAY_MS,
	useFullscreenProjectRail,
} from "@renderer/routes/-features/workspace/layout/use-fullscreen-project-rail";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

afterEach(() => {
	cleanup();
	jest.useRealTimers();
});

function finishWithdrawDelay() {
	void act(() => jest.advanceTimersByTime(PROJECT_RAIL_WITHDRAW_DELAY_MS));
}

function ProjectRailHarness() {
	const [focusRequests, setFocusRequests] = useState(0);
	const [menuOpen, setMenuOpen] = useState(false);
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
			const { width, intent } = resolveRailWidth(proposed);

			if (intent === "focus" && !projectRail.fullscreen) {
				return {
					vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
					intent,
					commit: () => {
						railFrameRef.current?.style.setProperty(RAIL_WIDTH_PROPERTY, `${railWidth}px`);
						projectRail.toggleFullscreen();
					},
				};
			}

			return {
				vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
				intent,
				commit: () => {
					if (projectRail.fullscreen) {
						projectRail.toggleFullscreen({ animate: false });
					}

					setRailWidth(width);
				},
			};
		},
	});

	return (
		<main>
			<button type="button" data-component="fullscreen-toggle" onClick={() => projectRail.toggleFullscreen()} />
			<button type="button" data-component="picker-release" onClick={() => projectRail.setPickerActive(false)} />
			<button
				type="button"
				data-component="menu-release"
				onClick={() => {
					setMenuOpen(false);
					projectRail.setMenuOpen(false);
				}}
			/>
			<span data-component="shell-focus-requests" data-count={focusRequests} />
			<span data-component="rail-width" data-value={railWidth} />
			<ProjectRailFrame
				projectRail={projectRail}
				divider={railDivider}
				frameRef={railFrameRef}
				railWidth={railWidth}
			>
				<div data-component="rail-controls">
					<button type="button" data-slot="rail-control" />
					<button type="button" data-slot="add-project" onClick={() => projectRail.setPickerActive(true)} />
					<button
						type="button"
						data-slot="open-menu"
						onClick={() => {
							setMenuOpen(true);
							projectRail.setMenuOpen(true, () => setMenuOpen(false));
						}}
					/>
					{menuOpen && <div data-component="rail-menu" />}
				</div>
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
		expect(get("rail-controls")).toBeDefined();
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

	test("withdraws 100ms after the pointer leaves", () => {
		jest.useFakeTimers();
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.pointerLeave(frame);
		expect(frame.dataset.revealed).toBe("true");

		void act(() => jest.advanceTimersByTime(PROJECT_RAIL_WITHDRAW_DELAY_MS - 1));
		expect(frame.dataset.revealed).toBe("true");

		void act(() => jest.advanceTimersByTime(1));
		expect(frame.dataset.revealed).toBe("false");
		expect(frame.inert).toBe(true);
	});

	test("cancels the pending withdrawal when the pointer returns", () => {
		jest.useFakeTimers();
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.pointerLeave(frame);
		fireEvent.pointerEnter(frame);
		finishWithdrawDelay();

		expect(frame.dataset.revealed).toBe("true");
	});

	test("pointer focus does not hold the rail open after the pointer leaves", () => {
		jest.useFakeTimers();
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		const control = slot(get("rail-controls"), "rail-control");
		fireEvent.pointerDown(control);
		fireEvent.focus(control);
		fireEvent.click(control);
		fireEvent.pointerLeave(frame);
		finishWithdrawDelay();

		expect(frame.dataset.revealed).toBe("false");
	});

	test("keyboard focus keeps the rail available until interaction leaves it", () => {
		jest.useFakeTimers();
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		const addProject = slot(get("rail-controls"), "add-project");
		fireEvent.focus(addProject);
		fireEvent.pointerLeave(frame);
		finishWithdrawDelay();
		expect(frame.dataset.revealed).toBe("true");

		fireEvent.blur(addProject, { relatedTarget: get("fullscreen-toggle") });
		expect(frame.dataset.revealed).toBe("false");
	});

	test("an open row menu holds the rail open", () => {
		jest.useFakeTimers();
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.click(slot(get("rail-controls"), "open-menu"));
		fireEvent.pointerLeave(frame);
		finishWithdrawDelay();
		expect(frame.dataset.revealed).toBe("true");
		expect(get("rail-menu")).toBeDefined();

		fireEvent.click(get("menu-release"));
		expect(query("rail-menu")).toBeNull();
		expect(frame.dataset.revealed).toBe("false");
	});

	test("entering fullscreen closes an open rail menu and requests Shell focus", () => {
		render(<ProjectRailHarness />);

		fireEvent.click(slot(get("rail-controls"), "open-menu"));
		expect(get("rail-menu")).toBeDefined();

		enterFullscreen();

		expect(query("rail-menu")).toBeNull();
		expect(get("shell-focus-requests").dataset.count).toBe("1");
		expect(get("project-rail-frame").dataset.revealed).toBe("false");
	});

	test("native picker activity survives window blur", () => {
		render(<ProjectRailHarness />);
		enterFullscreen();
		revealFromEdge();

		const frame = get("project-rail-frame");
		fireEvent.click(slot(get("rail-controls"), "add-project"));
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

		act(() => slot(get("rail-controls"), "add-project").focus());
		fireEvent.pointerMove(window, { clientX: 20 });
		fireEvent.click(get("fullscreen-toggle"));

		expect(get("shell-focus-requests").dataset.count).toBe("1");
	});
});
