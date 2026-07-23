import { afterEach, expect, test } from "bun:test";
import { useWorkspaceActivation } from "@renderer/routes/-utils/use-workspace-activation";
import { act, cleanup, renderHook } from "./testing-library";

afterEach(cleanup);

function renderActivation(ids: string[]) {
	return renderHook(({ available }: { available: string[] }) => useWorkspaceActivation(available), {
		initialProps: { available: ids },
	});
}

test("empty list has no active project and no residents", () => {
	const { result } = renderActivation([]);

	expect(result.current.activeProjectId).toBeUndefined();
	expect(result.current.residentProjectIds).toEqual([]);
});

test("first available project is the implicit active fallback", () => {
	const { result } = renderActivation(["a", "b"]);

	expect(result.current.activeProjectId).toBe("a");
	expect(result.current.residentProjectIds).toEqual(["a"]);
});

test("activation keeps the outgoing workspace resident", () => {
	const { result } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["a", "b"]);
});

test("re-activation does not duplicate residency", () => {
	const { result } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));
	act(() => result.current.activateProject("b"));

	expect(result.current.residentProjectIds).toEqual(["a", "b"]);
});

test("reorder preserves residency and follows available order", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));
	rerender({ available: ["b", "a"] });

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["b", "a"]);
});

test("implicit fallback is not retained across a reorder before any activation", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	rerender({ available: ["b", "a"] });

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["b"]);
});

test("activating a not-yet-available id reports it active and withholds its workspace", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("c"));

	expect(result.current.activeProjectId).toBe("c");
	expect(result.current.residentProjectIds).toEqual(["a"]);

	rerender({ available: ["a", "b", "c"] });

	expect(result.current.activeProjectId).toBe("c");
	expect(result.current.residentProjectIds).toEqual(["a", "c"]);
});

test("explicit active id that disappears does not fall back and returns resident", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));
	rerender({ available: ["a"] });

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["a"]);

	rerender({ available: ["a", "b"] });

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["a", "b"]);
});

test("dropping an inactive resident keeps the active project", () => {
	const { result } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));
	act(() => result.current.dropWorkspace("a"));

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["b"]);
});

test("dropping the explicit active id falls back through the currently supplied list", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("a"));
	act(() => result.current.dropWorkspace("a"));

	expect(result.current.activeProjectId).toBe("a");
	expect(result.current.residentProjectIds).toEqual(["a"]);

	rerender({ available: ["b"] });

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["b"]);
});

test("dropping the last project empties activation once the list updates", () => {
	const { result, rerender } = renderActivation(["a"]);

	act(() => result.current.activateProject("a"));
	act(() => result.current.dropWorkspace("a"));
	rerender({ available: [] });

	expect(result.current.activeProjectId).toBeUndefined();
	expect(result.current.residentProjectIds).toEqual([]);
});
