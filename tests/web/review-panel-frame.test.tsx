import { afterEach, expect, test } from "bun:test";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import type { useDivider } from "@renderer/routes/-utils/use-divider";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const divider: ReturnType<typeof useDivider> = {
	resizing: false,
	intent: undefined,
	valueMin: 280,
	valueMax: 1000,
	valueNow: 648,
	onKeyDown: () => {},
	pointerProps: {
		onPointerDown: () => {},
		onPointerMove: () => {},
		onPointerUp: () => {},
		onPointerCancel: () => {},
	},
};

test("publishes the shared layout motion contract while open", () => {
	render(
		<ReviewPanelFrame
			open
			expanded={false}
			motion="open"
			width={811}
			liveWidth="811px"
			divider={divider}
			onMotionEnd={() => {}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	const frame = get("review-panel-frame");

	expect(frame.dataset.open).toBe("true");
	expect(frame.dataset.animating).toBe("true");
	expect(frame.dataset.width).toBe("811");
	expect(frame.dataset.motionDuration).toBe(String(LAYOUT_MOTION_DURATION_MS));
	expect(frame.inert).toBe(false);
	expect(get("review-content")).toBeDefined();
});

test("suppresses the open/close motion while the panel is being resized", () => {
	render(
		<ReviewPanelFrame
			open
			expanded={false}
			motion="open"
			width={811}
			liveWidth="811px"
			divider={{ ...divider, resizing: true }}
			onMotionEnd={() => {}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	expect(get("review-panel-frame").dataset.animating).toBe("false");
});

test("becomes inert when closed and owns the end of its width motion", () => {
	let motionEnds = 0;
	render(
		<ReviewPanelFrame
			open={false}
			expanded={false}
			motion="open"
			width={811}
			liveWidth="811px"
			divider={divider}
			onMotionEnd={() => {
				motionEnds += 1;
			}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	const frame = get("review-panel-frame");

	expect(frame.dataset.open).toBe("false");
	expect(frame.inert).toBe(true);

	const opacityTransition = new Event("transitionend", { bubbles: true });
	Object.defineProperty(opacityTransition, "propertyName", { value: "opacity" });
	fireEvent(frame, opacityTransition);
	expect(motionEnds).toBe(0);

	const widthTransition = new Event("transitionend", { bubbles: true });
	Object.defineProperty(widthTransition, "propertyName", { value: "width" });
	fireEvent(frame, widthTransition);
	expect(motionEnds).toBe(1);
});

test("expanded, the panel holds its docked place in the row and lays the surface over it", () => {
	render(
		<ReviewPanelFrame
			open
			expanded
			motion={undefined}
			width={811}
			liveWidth="1400px"
			divider={divider}
			onMotionEnd={() => {}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	const frame = get("review-panel-frame");

	expect(frame.dataset.expanded).toBe("true");
	expect(frame.dataset.covering).toBe("true");
	expect(frame.style.width).toBe("811px");
	expect(get("review-panel-surface").style.width).toBe("1400px");
});

test("keeps the surface clipped while the panel merely opens", () => {
	render(
		<ReviewPanelFrame
			open
			expanded={false}
			motion="open"
			width={811}
			liveWidth="811px"
			divider={divider}
			onMotionEnd={() => {}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	expect(get("review-panel-frame").dataset.covering).toBe("false");
});

test("uncovers the shells as soon as the panel starts docking back", () => {
	render(
		<ReviewPanelFrame
			open
			expanded={false}
			motion="expand"
			width={811}
			liveWidth="811px"
			divider={divider}
			onMotionEnd={() => {}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	expect(get("review-panel-frame").dataset.covering).toBe("true");
});

test("drops the resize handle while the panel is expanded", () => {
	render(
		<ReviewPanelFrame
			open
			expanded
			motion={undefined}
			width={811}
			liveWidth="1400px"
			divider={divider}
			onMotionEnd={() => {}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	expect(() => slot(get("review-panel-frame"), "resize")).toThrow();
});

test("ends the expand motion from the surface that carries it", () => {
	let motionEnds = 0;
	render(
		<ReviewPanelFrame
			open
			expanded
			motion="expand"
			width={811}
			liveWidth="1400px"
			divider={divider}
			onMotionEnd={() => {
				motionEnds += 1;
			}}
		>
			<div data-component="review-content" />
		</ReviewPanelFrame>,
	);

	const widthTransition = new Event("transitionend", { bubbles: true });
	Object.defineProperty(widthTransition, "propertyName", { value: "width" });
	fireEvent(get("review-panel-surface"), widthTransition);

	expect(motionEnds).toBe(1);
});
