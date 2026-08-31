import "./register-dom";
import { expect, test } from "bun:test";
import { useReviewPanelState } from "@renderer/routes/-features/review/panel/use-review-panel-state";
import { act, renderHook } from "./testing-library";

test("focus restores a closed review panel to closed", () => {
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: false,
		initialExpanded: false,
		onClose: () => {},
	}));

	act(() => result.current.toggleFocus());
	expect(result.current.mode).toBe("review");
	expect(result.current.expanded).toBe(true);

	act(() => result.current.toggleFocus());
	expect(result.current.mode).toBe("closed");
	expect(result.current.expanded).toBe(false);
});

test("each Shell restores its own review panel state", () => {
	const { result, rerender } = renderHook(
		({ shellId }: { shellId: string }) => useReviewPanelState({
			shellId,
			initialOpen: false,
			initialExpanded: false,
			onClose: () => {},
		}),
		{ initialProps: { shellId: "shell-x" } },
	);

	act(() => result.current.changeMode("review"));
	expect(result.current.mode).toBe("review");

	rerender({ shellId: "shell-y" });
	expect(result.current.mode).toBe("closed");

	rerender({ shellId: "shell-x" });
	expect(result.current.mode).toBe("review");
});

test("focus restores an open review panel to its docked state", () => {
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: true,
		initialExpanded: false,
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
		onClose: () => {
			closes += 1;
		},
	}));

	act(() => result.current.toggleFocus());

	expect(result.current.mode).toBe("review");
	expect(closes).toBe(0);
});

test("the bay has one mode and Page transitions never create a parallel Review state", () => {
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: true,
		initialExpanded: false,
		onClose: () => {},
	}));

	act(() => result.current.changeMode("page"));
	expect(result.current.mode).toBe("page");

	act(() => result.current.changeMode("todos"));
	expect(result.current.mode).toBe("todos");

	act(() => result.current.changeMode("review"));
	expect(result.current.mode).toBe("review");
	expect("open" in result.current).toBe(false);
	expect("changeOpen" in result.current).toBe(false);
});

test("focus on the todo list keeps that mode", () => {
	const { result } = renderHook(() => useReviewPanelState({
		initialOpen: false,
		initialExpanded: false,
		onClose: () => {},
	}));

	act(() => result.current.changeMode("todos"));
	act(() => result.current.toggleFocus());

	expect(result.current.mode).toBe("todos");
	expect(result.current.expanded).toBe(true);
});
