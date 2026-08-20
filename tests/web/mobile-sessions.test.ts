import { expect, test } from "bun:test";
import type { Project } from "@shared/projects";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";
import { mobileSessionList } from "@renderer/routes/mobile/-utils/mobile-session-list";

const NOW = 1_800_000_000_000;
const EVERY_PROJECT = () => true;
const NO_PROJECT_LIST: Project[] = [];

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
		pinnedAt: undefined,
		activity: undefined,
		since: undefined,
		...patch,
	};
}

function order(rows: SessionRow[], includesProject: (projectId: string) => boolean = EVERY_PROJECT): string[] {
	return mobileSessionList({ rows, projects: NO_PROJECT_LIST, includesProject, now: NOW })
		.sessions.map((entry) => entry.shellId);
}

test("attention comes first, then work, then what finished", () => {
	const rows = [
		row("idle"),
		row("done", { activity: "done" }),
		row("working", { activity: "working" }),
		row("waiting", { activity: "needs-attention" }),
	];

	expect(order(rows)).toEqual(["waiting", "working", "done", "idle"]);
});

test("a pinned session outranks everything but a session asking for attention", () => {
	const rows = [
		row("idle"),
		row("done", { activity: "done" }),
		row("pinned", { pinnedAt: NOW }),
		row("working", { activity: "working" }),
		row("waiting", { activity: "needs-attention" }),
	];

	expect(order(rows)).toEqual(["waiting", "pinned", "working", "done", "idle"]);
});

test("sessions of different projects interleave by attention, never grouped by project", () => {
	const rows = [
		row("bankai-idle", { projectId: "p1" }),
		row("ghost-waiting", { projectId: "p2", activity: "needs-attention" }),
		row("bankai-working", { projectId: "p1", activity: "working" }),
	];

	expect(order(rows)).toEqual(["ghost-waiting", "bankai-working", "bankai-idle"]);
});

test("sessions sharing a state keep the order they arrived in", () => {
	const rows = [
		row("first", { activity: "working" }),
		row("second", { activity: "working" }),
		row("third", { activity: "working" }),
	];

	expect(order(rows)).toEqual(["first", "second", "third"]);
});

test("filed sessions leave the list for the shelf, freshest first", () => {
	const rows = [row("open"), row("filed", { archivedAt: NOW - 1000 }), row("filed-later", { archivedAt: NOW })];
	const list = mobileSessionList({
		rows,
		projects: NO_PROJECT_LIST,
		includesProject: EVERY_PROJECT,
		now: NOW,
	});

	expect(list.sessions.map((entry) => entry.shellId)).toEqual(["open"]);
	expect(list.archived.map((entry) => entry.shellId)).toEqual(["filed-later", "filed"]);
});

test("chosen projects narrow the shelf as they narrow the list", () => {
	const rows = [row("a", { projectId: "p1", archivedAt: NOW }), row("b", { projectId: "p2", archivedAt: NOW })];
	const list = mobileSessionList({
		rows,
		projects: NO_PROJECT_LIST,
		includesProject: (projectId: string) => projectId === "p2",
		now: NOW,
	});

	expect(list.archived.map((entry) => entry.shellId)).toEqual(["b"]);
});

test("chosen projects narrow the list and accumulate", () => {
	const rows = [
		row("a", { projectId: "p1" }),
		row("b", { projectId: "p2" }),
		row("c", { projectId: "p3" }),
	];

	expect(order(rows, (projectId) => projectId === "p2")).toEqual(["b"]);
	expect(order(rows, (projectId) => ["p2", "p3"].includes(projectId))).toEqual(["b", "c"]);
});

test("a project badge carries the most urgent state of its sessions", () => {
	const { projectActivity } = mobileSessionList({
		rows: [
			row("a", { projectId: "p1", activity: "done" }),
			row("b", { projectId: "p1", activity: "needs-attention" }),
			row("c", { projectId: "p2", activity: "working" }),
			row("d", { projectId: "p3" }),
		],
		projects: NO_PROJECT_LIST,
		includesProject: EVERY_PROJECT,
		now: NOW,
	});

	expect(projectActivity.get("p1")).toBe("needs-attention");
	expect(projectActivity.get("p2")).toBe("working");
	expect(projectActivity.get("p3")).toBeUndefined();
});

test("a badge keeps reporting activity of the projects the list is hiding", () => {
	const { projectActivity } = mobileSessionList({
		rows: [
			row("a", { projectId: "p1" }),
			row("b", { projectId: "p2", activity: "needs-attention" }),
		],
		projects: NO_PROJECT_LIST,
		includesProject: (projectId: string) => projectId === "p1",
		now: NOW,
	});

	expect(projectActivity.get("p2")).toBe("needs-attention");
});

test("the projects come out named in reading order, so every surface shows the same list", () => {
	const projects: Project[] = [
		{ id: "p2", name: "ghostapi", path: "/projects/ghostapi", createdAt: 2 },
		{ id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 1 },
		{ id: "p3", name: "axiom", path: "/projects/axiom", createdAt: 3 },
	];

	const listed = mobileSessionList({ rows: [], projects, includesProject: EVERY_PROJECT, now: NOW });

	expect(listed.projects.map((project) => project.id)).toEqual(["p3", "p1", "p2"]);
	expect(projects.map((project) => project.id)).toEqual(["p2", "p1", "p3"]);
});
