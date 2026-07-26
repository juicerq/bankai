import { afterEach, expect, test } from "bun:test";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useSessionList } from "@renderer/routes/-utils/use-session-list";
import { act, cleanup, renderHook } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

function row(shellId: string, patch: Partial<SessionRow> = {}): SessionRow {
	return {
		shellId,
		projectId: "p1",
		projectName: "bankai",
		title: shellId,
		branch: undefined,
		harness: undefined,
		createdAt: NOW,
		lastTouchedAt: NOW,
		archivedAt: undefined,
		activity: undefined,
		lastLine: undefined,
		...patch,
	};
}

function renderList(rows: SessionRow[]) {
	return renderHook(() => useSessionList(rows, NOW));
}

test("the open list holds every session the user has not filed away", () => {
	const { result } = renderList([row("a"), row("b"), row("filed", { archivedAt: NOW })]);

	expect(result.current.open.map((entry) => entry.shellId)).toEqual(["a", "b"]);
	expect(result.current.archived.map((entry) => entry.shellId)).toEqual(["filed"]);
});

test("a reorder of the incoming rows is the only thing that moves the list", () => {
	const { result, rerender } = renderHook(({ rows }: { rows: SessionRow[] }) => useSessionList(rows, NOW), {
		initialProps: { rows: [row("a"), row("b")] },
	});

	expect(result.current.open.map((entry) => entry.shellId)).toEqual(["a", "b"]);

	rerender({ rows: [row("b"), row("a")] });

	expect(result.current.open.map((entry) => entry.shellId)).toEqual(["b", "a"]);
});

test("numbering walks the open list then the archive, stopping at nine", () => {
	const rows = [
		...Array.from({ length: 11 }, (_, index) => row(`s${index}`)),
		row("filed", { archivedAt: NOW }),
	];
	const { result } = renderList(rows);

	expect(result.current.numbered.map((entry) => entry.shellId)).toEqual([
		"s0",
		"s1",
		"s2",
		"s3",
		"s4",
		"s5",
		"s6",
		"s7",
		"s8",
	]);
});

test("the archive opens closed and its rows stay out of the numbering until it does", () => {
	const { result } = renderList([row("a"), row("filed", { archivedAt: NOW })]);

	expect(result.current.archivedOpen).toBe(false);
	expect(result.current.numbered.map((entry) => entry.shellId)).toEqual(["a"]);

	act(() => result.current.toggleArchived());

	expect(result.current.numbered.map((entry) => entry.shellId)).toEqual(["a", "filed"]);
});

test("the keyboard reaches the first waiting session in the open list", () => {
	const rows = [
		row("quiet"),
		row("first-wait", { activity: "needs-attention" }),
		row("second-wait", { activity: "needs-attention" }),
	];
	const { result } = renderList(rows);

	expect(result.current.waiting?.shellId).toBe("first-wait");
});

test("a stale session with nothing waiting leaves the keyboard nowhere to jump", () => {
	const { result } = renderList([row("stale", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1 })]);

	expect(result.current.open).toEqual([]);
	expect(result.current.waiting).toBeUndefined();
});
