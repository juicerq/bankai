import { describe, expect, test } from "bun:test";
import type { ContinuityValue } from "@shared/continuity";
import type { AgentActivityState } from "@shared/activity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import { partitionSessions, type SessionRow, sessionRows } from "@renderer/routes/-features/sessions/list/session-rows";

const PROJECTS = [
	{ id: "p1", name: "bankai" },
	{ id: "p2", name: "ledger" },
];

const NOW = 1_800_000_000_000;

function rowsOf(
	continuity: ContinuityValue,
	activity: Record<string, AgentActivityState> = {},
	statusSince: Record<string, number> = {},
	harnesses: Record<string, string> = {},
) {
	return sessionRows({
		continuity,
		projects: PROJECTS,
		shellActivity: new Map(Object.entries(activity)),
		statusSince: new Map(Object.entries(statusSince)),
		harnesses: new Map(Object.entries(harnesses)),
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

	test("the moment the state changed reaches a shell with activity", () => {
		const [row] = rowsOf(
			{ workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }] },
			{ s1: "working" },
			{ s1: NOW - 6000 },
		);

		expect(row?.since).toBe(NOW - 6000);
	});

	test("a shell with no activity carries no clock", () => {
		const [row] = rowsOf(
			{ workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }] },
			{},
			{ s1: NOW - 6000 },
		);

		expect(row?.since).toBeUndefined();
	});

	test("a persisted completion restores done and its clock without a live snapshot", () => {
		const doneAt = NOW - 1000;
		const stopped: ContinuityValue = {
			workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1, doneAt }] }],
		};

		expect(rowsOf(stopped)[0]).toMatchObject({ activity: "done", since: doneAt });
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

	test("a live agent names the harness before any session ref exists", () => {
		const [row] = rowsOf(
			{ workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }] },
			{},
			{},
			{ s1: "codex" },
		);

		expect(row?.harness).toBe("codex");
	});

	test("the agent running now outranks the ref of the one that ran before", () => {
		const [row] = rowsOf(
			{
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
			},
			{},
			{},
			{ s1: "codex" },
		);

		expect(row?.harness).toBe("codex");
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
		pinnedAt: undefined,
		activity: undefined,
		since: undefined,
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

	test("an explicit archive files a session even while its agent is working", () => {
		const waiting = row("waiting", { archivedAt: NOW, activity: "needs-attention" });

		expect(partitionSessions([waiting], NOW).archived.map((entry) => entry.shellId)).toEqual(["waiting"]);
	});

	test("activity holds a stale session open too", () => {
		const busy = row("busy", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1, activity: "working" });

		expect(partitionSessions([busy], NOW).open.map((entry) => entry.shellId)).toEqual(["busy"]);
	});

	test("a pin holds a stale session open for good", () => {
		const kept = row("kept", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1, pinnedAt: NOW - 1 });

		expect(partitionSessions([kept], NOW).open.map((entry) => entry.shellId)).toEqual(["kept"]);
	});

	test("pinned sessions lead the open list without reordering each other", () => {
		const rows = [
			row("loose-first"),
			row("pinned-first", { pinnedAt: NOW }),
			row("loose-last"),
			row("pinned-last", { pinnedAt: NOW - 500 }),
		];

		expect(partitionSessions(rows, NOW).open.map((entry) => entry.shellId)).toEqual([
			"pinned-first",
			"pinned-last",
			"loose-first",
			"loose-last",
		]);
	});

	test("done holds a stale session open until the user resolves it", () => {
		const done = row("done", { lastTouchedAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1, activity: "done" });

		expect(partitionSessions([done], NOW).open.map((entry) => entry.shellId)).toEqual(["done"]);
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
