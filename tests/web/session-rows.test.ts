import { describe, expect, test } from "bun:test";
import type { ContinuityValue } from "@main/store/continuity";
import type { AgentActivityState } from "@shared/activity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import {
	partitionSessions,
	type SessionRow,
	sessionRows,
	successorRow,
} from "@renderer/routes/-utils/session-rows";

const PROJECTS = [
	{ id: "p1", name: "bankai" },
	{ id: "p2", name: "ledger" },
];

const NOW = 1_800_000_000_000;

function rowsOf(
	continuity: ContinuityValue,
	activity: Record<string, AgentActivityState> = {},
	lastLines: Record<string, string> = {},
) {
	return sessionRows({
		continuity,
		projects: PROJECTS,
		shellActivity: new Map(Object.entries(activity)),
		lastLines: new Map(Object.entries(lastLines)),
	});
}

describe("building the flat list", () => {
	test("flattens every workspace, including a project never mounted this session", () => {
		const rows = rowsOf({
			workspaces: [
				{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 10 }] },
				{ projectId: "p2", shells: [{ id: "s2", label: "Shell 1", createdAt: 20 }] },
			],
		});

		expect(rows.map((row) => row.shellId)).toEqual(["s2", "s1"]);
		expect(rows.map((row) => row.projectName)).toEqual(["ledger", "bankai"]);
	});

	test("drops a workspace whose project is gone from the list", () => {
		const rows = rowsOf({
			workspaces: [{ projectId: "removed", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }],
		});

		expect(rows).toEqual([]);
	});

	test("sorts by creation descending, newest session on top", () => {
		const rows = rowsOf({
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{ id: "old", label: "Shell 1", createdAt: 1 },
						{ id: "new", label: "Shell 2", createdAt: 3 },
						{ id: "mid", label: "Shell 3", createdAt: 2 },
					],
				},
			],
		});

		expect(rows.map((row) => row.shellId)).toEqual(["new", "mid", "old"]);
	});

	test("being touched never moves a session", () => {
		const rows = rowsOf({
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{ id: "new", label: "Shell 2", createdAt: 3, lastTouchedAt: 1 },
						{ id: "old", label: "Shell 1", createdAt: 1, lastTouchedAt: 999 },
					],
				},
			],
		});

		expect(rows.map((row) => row.shellId)).toEqual(["new", "old"]);
	});

	test("sessions migrated without a creation stamp keep a stable order", () => {
		const rows = rowsOf({
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{ id: "b", label: "Shell 1", createdAt: 0 },
						{ id: "a", label: "Shell 2", createdAt: 0 },
					],
				},
			],
		});

		expect(rows.map((row) => row.shellId)).toEqual(["a", "b"]);
	});

	test("a derived title wins over branch and label", () => {
		const [row] = rowsOf({
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{ id: "s1", label: "Shell 1", createdAt: 1, branch: "main", title: "flatten the sidebar" },
					],
				},
			],
		});

		expect(row?.title).toBe("flatten the sidebar");
	});

	test("a shell with no title falls back to its branch", () => {
		const [row] = rowsOf({
			workspaces: [
				{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1, branch: "fix/drift" }] },
			],
		});

		expect(row?.title).toBe("fix/drift");
	});

	test("a shell with neither title nor branch falls back to its label", () => {
		const [row] = rowsOf({
			workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 4", createdAt: 1 }] }],
		});

		expect(row?.title).toBe("Shell 4");
	});

	test("the last output line reaches a shell with activity", () => {
		const [row] = rowsOf(
			{ workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }] },
			{ s1: "working" },
			{ s1: "Running bun run check" },
		);

		expect(row?.lastLine).toBe("Running bun run check");
	});

	test("a shell with no activity carries no last output line", () => {
		const [row] = rowsOf(
			{ workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }] },
			{},
			{ s1: "vite ready in 412 ms" },
		);

		expect(row?.lastLine).toBeUndefined();
	});

	test("the harness comes from the persisted session ref", () => {
		const [row] = rowsOf({
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{
							id: "s1",
							label: "Shell 1",
							createdAt: 1,
							session: { harness: "claude", sessionId: "abc", cwd: "/tmp/p1" },
						},
					],
				},
			],
		});

		expect(row?.harness).toBe("claude");
	});
});

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

describe("splitting the open list from the archive", () => {
	test("a fresh session with no activity still counts as open", () => {
		const sections = partitionSessions([row("a")], NOW);

		expect(sections.open.map((entry) => entry.shellId)).toEqual(["a"]);
		expect(sections.archived).toEqual([]);
	});

	test("only an explicit archive moves a session out of the open list", () => {
		const sections = partitionSessions([row("a"), row("filed", { archivedAt: NOW })], NOW);

		expect(sections.open.map((entry) => entry.shellId)).toEqual(["a"]);
		expect(sections.archived.map((entry) => entry.shellId)).toEqual(["filed"]);
	});

	test("a session untouched past the window archives itself", () => {
		const stale = row("stale", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1 });

		expect(partitionSessions([stale], NOW).archived.map((entry) => entry.shellId)).toEqual(["stale"]);
	});

	test("a session sitting right on the window stays open", () => {
		const edge = row("edge", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS });

		expect(partitionSessions([edge], NOW).open.map((entry) => entry.shellId)).toEqual(["edge"]);
	});

	test("a never-touched session ages from its creation", () => {
		const cold = row("cold", { createdAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1, lastTouchedAt: undefined });

		expect(partitionSessions([cold], NOW).archived.map((entry) => entry.shellId)).toEqual(["cold"]);
	});

	test("activity holds a session open against an explicit archive", () => {
		const waiting = row("waiting", { archivedAt: NOW, activity: "needs-attention" });

		expect(partitionSessions([waiting], NOW).open.map((entry) => entry.shellId)).toEqual(["waiting"]);
	});

	test("activity holds a stale session open too", () => {
		const busy = row("busy", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1, activity: "working" });

		expect(partitionSessions([busy], NOW).open.map((entry) => entry.shellId)).toEqual(["busy"]);
	});

	test("the archive orders by when the work ended, not by when it started", () => {
		const rows = [
			row("filed-first", { createdAt: NOW, archivedAt: NOW - 100 }),
			row("filed-last", { createdAt: NOW - 500, archivedAt: NOW - 10 }),
		];

		expect(partitionSessions(rows, NOW).archived.map((entry) => entry.shellId)).toEqual([
			"filed-last",
			"filed-first",
		]);
	});

	test("an auto-archived session orders by its last touch", () => {
		const rows = [
			row("older", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 500 }),
			row("newer", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 10 }),
		];

		expect(partitionSessions(rows, NOW).archived.map((entry) => entry.shellId)).toEqual([
			"newer",
			"older",
		]);
	});
});

describe("choosing what takes the closed session's place", () => {
	test("the nearest remaining session of the same project wins", () => {
		const rows = [row("closing"), { ...row("newer"), projectId: "p2" }, row("older")];

		expect(successorRow(rows, { projectId: "p1", shellId: "closing" })?.shellId).toBe("older");
	});

	test("with nothing left in that project the top of the list wins", () => {
		const rows = [row("closing"), { ...row("elsewhere"), projectId: "p2" }];

		expect(successorRow(rows, { projectId: "p1", shellId: "closing" })?.shellId).toBe("elsewhere");
	});

	test("closing the last session anywhere leaves no successor", () => {
		expect(successorRow([row("closing")], { projectId: "p1", shellId: "closing" })).toBeUndefined();
	});
});
