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
	expect(result.current.mode).toBe("review");
	expect(result.current.expanded).toBe(true);

	act(() => result.current.toggleFocus());
	expect(result.current.mode).toBe("closed");
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

	expect(result.current.mode).toBe("review");
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

	act(() => result.current.changeMode("closed"));
	expect(closes).toBe(1);

	act(() => result.current.changeMode("review"));
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

	expect(result.current.mode).toBe("review");
	expect(closes).toBe(0);
});

test("the bay has one mode and Page transitions never create a parallel Review state", () => {
	const patches: object[] = [];
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: true,
		initialExpanded: false,
		persist: (patch) => patches.push(patch),
		onClose: () => {},
	}));

	act(() => result.current.changeMode("page"));
	expect(result.current.mode).toBe("page");

	act(() => result.current.changeMode("todos"));
	expect(result.current.mode).toBe("todos");

	act(() => result.current.changeMode("review"));
	expect(result.current.mode).toBe("review");
	expect(patches).toEqual([{ reviewOpen: false }, { reviewOpen: false }, { reviewOpen: true }]);
	expect("open" in result.current).toBe(false);
	expect("changeOpen" in result.current).toBe(false);
});

test("focus on the todo list keeps that mode and never persists the bay as open", () => {
	const patches: object[] = [];
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: false,
		initialExpanded: false,
		persist: (patch) => patches.push(patch),
		onClose: () => {},
	}));

	act(() => result.current.changeMode("todos"));
	act(() => result.current.toggleFocus());

	expect(result.current.mode).toBe("todos");
	expect(result.current.expanded).toBe(true);
	expect(patches).toEqual([{ reviewOpen: false }, { reviewOpen: false, reviewExpanded: true }]);
});
