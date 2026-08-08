import "./register-dom";
import { expect, test } from "bun:test";
import { useReviewPanelState } from "@renderer/routes/-features/review/panel/use-review-panel-state";
import { act, renderHook } from "./testing-library";

test("focus restores a closed review panel to closed", () => {
	const patches: object[] = [];
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: false,
		initialExpanded: false,
		persist: (patch) => patches.push(patch),
		onClose: () => {},
	}));

	act(() => result.current.toggleFocus());
	expect(result.current.open).toBe(true);
	expect(result.current.expanded).toBe(true);

	act(() => result.current.toggleFocus());
	expect(result.current.open).toBe(false);
	expect(result.current.expanded).toBe(false);
	expect(patches).toEqual([
		{ reviewOpen: true, reviewExpanded: true },
		{ reviewOpen: false, reviewExpanded: false },
	]);
});

test("focus restores an open review panel to its docked state", () => {
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: true,
		initialExpanded: false,
		persist: () => {},
		onClose: () => {},
	}));

	act(() => result.current.toggleFocus());
	act(() => result.current.toggleFocus());

	expect(result.current.open).toBe(true);
	expect(result.current.expanded).toBe(false);
});

test("closing the review panel reports the close once", () => {
	let closes = 0;
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: true,
		initialExpanded: false,
		persist: () => {},
		onClose: () => {
			closes += 1;
		},
	}));

	act(() => result.current.changeOpen(false));
	expect(closes).toBe(1);

	act(() => result.current.changeOpen(true));
	expect(closes).toBe(1);
});

test("focus that leaves the review panel closed reports the close", () => {
	let closes = 0;
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: false,
		initialExpanded: false,
		persist: () => {},
		onClose: () => {
			closes += 1;
		},
	}));

	act(() => result.current.toggleFocus());
	expect(closes).toBe(0);

	act(() => result.current.toggleFocus());
	expect(closes).toBe(1);
});

test("docking an expanded review panel that stays open reports no close", () => {
	let closes = 0;
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: true,
		initialExpanded: true,
		persist: () => {},
		onClose: () => {
			closes += 1;
		},
	}));

	act(() => result.current.toggleFocus());

	expect(result.current.open).toBe(true);
	expect(closes).toBe(0);
});
