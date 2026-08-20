import { afterEach, expect, test } from "bun:test";
import { useProjectNarrowing } from "@renderer/routes/-features/projects/use-project-narrowing";
import { act, cleanup, renderHook } from "./testing-library";

afterEach(cleanup);

test("nothing is narrowed until the user marks a project", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	expect([...result.current.marks]).toEqual([]);
	expect(result.current.includesProject("p1")).toBe(true);
});

test("naming projects accumulates them and naming one again takes it back out", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.toggle("p1"));
	act(() => result.current.toggle("p2"));

	expect(result.current.includesProject("p1")).toBe(true);
	expect(result.current.includesProject("p3")).toBe(false);

	act(() => result.current.toggle("p1"));

	expect(result.current.includesProject("p1")).toBe(false);
	expect(result.current.includesProject("p2")).toBe(true);
});

test("hiding a project leaves every other project listed", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.exclude("p1"));

	expect(result.current.includesProject("p1")).toBe(false);
	expect(result.current.includesProject("p2")).toBe(true);
	expect(result.current.includesProject("mounted-later")).toBe(true);
});

test("hiding a project again brings it back", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.exclude("p1"));
	act(() => result.current.exclude("p1"));

	expect([...result.current.marks]).toEqual([]);
	expect(result.current.includesProject("p1")).toBe(true);
});

test("a named project wins over a hidden one, so the list stays what the user asked for", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.exclude("p1"));
	act(() => result.current.toggle("p2"));

	expect(result.current.includesProject("p1")).toBe(false);
	expect(result.current.includesProject("p2")).toBe(true);
	expect(result.current.includesProject("p3")).toBe(false);
});

test("naming a hidden project marks it chosen instead of keeping it hidden", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.exclude("p1"));
	act(() => result.current.toggle("p1"));

	expect(result.current.marks.get("p1")).toBe("chosen");
});

test("a project that goes away stops narrowing the list it left behind", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.toggle("p1"));
	act(() => result.current.forget("p1"));

	expect([...result.current.marks]).toEqual([]);
});

test("forgetting a project nobody marked leaves the marks it had", () => {
	const { result } = renderHook(() => useProjectNarrowing());

	act(() => result.current.toggle("p1"));

	const marks = result.current.marks;
	act(() => result.current.forget("p2"));

	expect(result.current.marks).toBe(marks);
});
