import { afterEach, expect, test } from "bun:test";
import { useChosenProjects } from "@renderer/routes/-features/projects/use-chosen-projects";
import { act, cleanup, renderHook } from "./testing-library";

afterEach(cleanup);

test("nothing is narrowed until the user names a project", () => {
	const { result } = renderHook(() => useChosenProjects());

	expect([...result.current.projectIds]).toEqual([]);
});

test("naming projects accumulates them and naming one again takes it back out", () => {
	const { result } = renderHook(() => useChosenProjects());

	act(() => result.current.toggle("p1"));
	act(() => result.current.toggle("p2"));

	expect([...result.current.projectIds]).toEqual(["p1", "p2"]);

	act(() => result.current.toggle("p1"));

	expect([...result.current.projectIds]).toEqual(["p2"]);
});

test("a project that goes away stops narrowing the list it left behind", () => {
	const { result } = renderHook(() => useChosenProjects());

	act(() => result.current.toggle("p1"));
	act(() => result.current.forget("p1"));

	expect([...result.current.projectIds]).toEqual([]);
});

test("forgetting a project nobody named leaves the set it had", () => {
	const { result } = renderHook(() => useChosenProjects());

	act(() => result.current.toggle("p1"));

	const chosen = result.current.projectIds;
	act(() => result.current.forget("p2"));

	expect(result.current.projectIds).toBe(chosen);
});
