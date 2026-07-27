import { afterEach, expect, test } from "bun:test";
import {
	restoredResidentProjectIds,
	useWorkspaceActivation,
} from "@renderer/routes/-utils/use-workspace-activation";
import { act, cleanup, renderHook } from "./testing-library";

afterEach(cleanup);

function renderActivation(ids: string[]) {
	return renderHook(({ available }: { available: string[] }) => useWorkspaceActivation(available, {}), {
		initialProps: { available: ids },
	});
}

test("empty list has no active project and no residents", () => {
	const { result } = renderActivation([]);

	expect(result.current.activeProjectId).toBeUndefined();
	expect(result.current.residentProjectIds).toEqual([]);
});

test("first available project is the fallback while nothing is selected", () => {
	const { result } = renderActivation(["a", "b"]);

	expect(result.current.activeProjectId).toBe("a");
	expect(result.current.residentProjectIds).toEqual(["a"]);
});

test("the project owning the selected session is the active one", () => {
	const { result } = renderHook(() => useWorkspaceActivation(["a", "b"], { activeProjectId: "b" }));

	expect(result.current.activeProjectId).toBe("b");
	expect(result.current.residentProjectIds).toEqual(["b"]);
});

test("activation keeps a workspace resident after the selection leaves it", () => {
	const initialProps: { active: string | undefined } = { active: "a" };
	const { result, rerender } = renderHook(
		({ active }: { active: string | undefined }) =>
			useWorkspaceActivation(["a", "b"], { activeProjectId: active }),
		{ initialProps },
	);

	act(() => result.current.activateProject("a"));
	rerender({ active: "b" });

	expect(result.current.residentProjectIds).toEqual(["a", "b"]);
});

test("re-activation does not duplicate residency", () => {
	const { result } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));
	act(() => result.current.activateProject("b"));

	expect(result.current.residentProjectIds).toEqual(["a", "b"]);
});

test("residency follows the order of the available projects", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("a"));
	act(() => result.current.activateProject("b"));
	rerender({ available: ["b", "a"] });

	expect(result.current.residentProjectIds).toEqual(["b", "a"]);
});

test("activating a not-yet-available id withholds its workspace until it arrives", () => {
	const { result, rerender } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("c"));

	expect(result.current.residentProjectIds).toEqual(["a"]);

	rerender({ available: ["a", "b", "c"] });

	expect(result.current.residentProjectIds).toEqual(["a", "c"]);
});

test("dropping a resident removes its workspace", () => {
	const { result } = renderActivation(["a", "b"]);

	act(() => result.current.activateProject("b"));
	act(() => result.current.dropWorkspace("b"));

	expect(result.current.residentProjectIds).toEqual(["a"]);
});

test("dropping the last project empties activation once the list updates", () => {
	const { result, rerender } = renderActivation(["a"]);

	act(() => result.current.activateProject("a"));
	act(() => result.current.dropWorkspace("a"));
	rerender({ available: [] });

	expect(result.current.activeProjectId).toBeUndefined();
	expect(result.current.residentProjectIds).toEqual([]);
});

test("initializes residents from restored continuity, intersected with what is available", () => {
	const { result } = renderHook(() =>
		useWorkspaceActivation(["a", "c"], { activeProjectId: "a", initialResidentProjectIds: ["a", "b"] }),
	);

	expect(result.current.residentProjectIds).toEqual(["a"]);
});

test("a restored workspace whose shells were all closed is not a resident", () => {
	const workspaces = [
		{ projectId: "kept", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] },
		{ projectId: "emptied", shells: [] },
	];

	expect(restoredResidentProjectIds(workspaces)).toEqual(["kept"]);
});

test("a restored workspace holding only archived shells stays resident", () => {
	const workspaces = [
		{ projectId: "filed", shells: [{ id: "s1", label: "Shell 1", createdAt: 1, archivedAt: 2 }] },
	];

	expect(restoredResidentProjectIds(workspaces)).toEqual(["filed"]);
});
