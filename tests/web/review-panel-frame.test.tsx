import { afterEach, expect, test } from "bun:test";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import type { useDivider } from "@renderer/routes/-utils/use-divider";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const divider: ReturnType<typeof useDivider> = {
	resizing: false,
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
			animate
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
			animate
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
			animate
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
