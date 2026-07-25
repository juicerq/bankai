import { afterEach, describe, expect, test } from "bun:test";
import { useRef, useState } from "react";
import {
	DEFAULT_RAIL_WIDTH,
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-utils/rail-layout";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { get } from "./dom";
import { act, cleanup, fireEvent, render, renderHook } from "./testing-library";

afterEach(cleanup);

describe("fullscreen persistence seam", () => {
	test("restores the stored fullscreen state and reports every toggle", () => {
		const changes: boolean[] = [];
		const { result } = renderHook(() =>
			useFullscreenProjectRail(() => {}, {
				initialFullscreen: true,
				onFullscreenChange: (fullscreen) => changes.push(fullscreen),
			}),
		);

		expect(result.current.fullscreen).toBe(true);

		act(() => result.current.toggleFullscreen());
		expect(result.current.fullscreen).toBe(false);

		act(() => result.current.toggleFullscreen());
		expect(result.current.fullscreen).toBe(true);

		expect(changes).toEqual([false, true]);
	});
});

function RailPersistHarness({ persist }: { persist: (width: number) => void }) {
	const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
	const frameRef = useRef<HTMLDivElement>(null);
	const divider = useDivider({
		value: railWidth,
		min: MIN_RAIL_WIDTH,
		max: MAX_RAIL_WIDTH,
		sign: 1,
		target: frameRef,
		resolve: (proposed) => {
			const { width, intent } = resolveRailWidth(proposed);

			return {
				vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
				commit: intent === "dock"
					? () => {
						setRailWidth(width);
						persist(width);
					}
					: () => {},
			};
		},
	});

	return (
		<div ref={frameRef}>
			<div data-component="handle" {...divider.pointerProps} onKeyDown={divider.onKeyDown} />
		</div>
	);
}

describe("rail width persistence", () => {
	test("writes only on commit, never while the pointer is moving", () => {
		const calls: number[] = [];
		render(<RailPersistHarness persist={(width) => calls.push(width)} />);
		const handle = get("handle");

		fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
		fireEvent.pointerMove(handle, { clientX: 60, pointerId: 1 });
		expect(calls).toEqual([]);

		fireEvent.pointerUp(handle, { clientX: 60, pointerId: 1 });
		expect(calls).toEqual([DEFAULT_RAIL_WIDTH + 60]);
	});

	test("writes on a keyboard step", () => {
		const calls: number[] = [];
		render(<RailPersistHarness persist={(width) => calls.push(width)} />);
		const handle = get("handle");

		fireEvent.keyDown(handle, { key: "ArrowRight" });
		expect(calls.at(-1)).toBe(DEFAULT_RAIL_WIDTH + 8);
	});
});
