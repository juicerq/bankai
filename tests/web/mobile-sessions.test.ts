import { expect, test } from "bun:test";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { mobileSessionList } from "@renderer/routes/mobile/-utils/mobile-session-list";

const NOW = 1_800_000_000_000;
const NO_PROJECTS: ReadonlySet<string> = new Set();

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
		trace: undefined,
		traceSince: undefined,
		...patch,
	};
}

function order(rows: SessionRow[], chosenProjectIds: ReadonlySet<string> = NO_PROJECTS): string[] {
	return mobileSessionList({ rows, chosenProjectIds, now: NOW }).sessions.map((entry) => entry.shellId);
}

test("attention comes first, then work, then what finished unseen", () => {
	const rows = [
		row("idle"),
		row("done", { activity: "done-unseen" }),
		row("working", { activity: "working" }),
		row("waiting", { activity: "needs-attention" }),
	];

	expect(order(rows)).toEqual(["waiting", "working", "done", "idle"]);
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

test("filed sessions stay off the phone", () => {
	const rows = [row("open"), row("filed", { archivedAt: NOW })];

	expect(order(rows)).toEqual(["open"]);
});

test("chosen projects narrow the list and accumulate", () => {
	const rows = [
		row("a", { projectId: "p1" }),
		row("b", { projectId: "p2" }),
		row("c", { projectId: "p3" }),
	];

	expect(order(rows, new Set(["p2"]))).toEqual(["b"]);
	expect(order(rows, new Set(["p2", "p3"]))).toEqual(["b", "c"]);
});

test("a project badge carries the most urgent state of its sessions", () => {
	const { projectActivity } = mobileSessionList({
		rows: [
			row("a", { projectId: "p1", activity: "done-unseen" }),
			row("b", { projectId: "p1", activity: "needs-attention" }),
			row("c", { projectId: "p2", activity: "working" }),
			row("d", { projectId: "p3" }),
		],
		chosenProjectIds: NO_PROJECTS,
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
		chosenProjectIds: new Set(["p1"]),
		now: NOW,
	});

	expect(projectActivity.get("p2")).toBe("needs-attention");
});
