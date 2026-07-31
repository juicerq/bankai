import "./register-dom";
import { expect, test } from "bun:test";
import { useReviewPanelState } from "@renderer/routes/-utils/use-review-panel-state";
import { act, renderHook } from "./testing-library";

test("focus restores a closed review panel to closed", () => {
	const patches: object[] = [];
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: false,
		initialExpanded: false,
		persist: (patch) => patches.push(patch),
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
	}));

	act(() => result.current.toggleFocus());
	act(() => result.current.toggleFocus());

	expect(result.current.open).toBe(true);
	expect(result.current.expanded).toBe(false);
});
