import { describe, expect, test } from "bun:test";
import type { ContinuityValue } from "@main/store/continuity";
import type { AgentActivityState } from "@shared/activity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import {
	partitionSessions,
	type SessionRow,
	sessionRows,
	sessionSince,
	sessionTrace,
} from "@renderer/routes/-utils/session-rows";

const PROJECTS = [
	{ id: "p1", name: "bankai" },
	{ id: "p2", name: "ledger" },
];

const NOW = 1_800_000_000_000;

function rowsOf(
	continuity: ContinuityValue,
	activity: Record<string, AgentActivityState> = {},
	traces: Record<string, string> = {},
) {
	return sessionRows({
		continuity,
		projects: PROJECTS,
		shellActivity: new Map(Object.entries(activity)),
		traces: new Map(Object.entries(traces)),
		traceSince: new Map(),
		statusSince: new Map(),
		attention: new Map(),
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

		expect(row?.trace).toBe("Running bun run check");
	});

	test("a shell with no activity carries no last output line", () => {
		const [row] = rowsOf(
			{ workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }] },
			{},
			{ s1: "vite ready in 412 ms" },
		);

		expect(row?.trace).toBeUndefined();
	});

	test("a finished agent says so instead of replaying its last block", () => {
		const stopped = {
			workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }],
		};

		expect(rowsOf(stopped, { s1: "done-unseen" }, { s1: "Writing" })[0]?.trace).toBe("Done");
	});

	test("a waiting agent shows the reason the main process read from the registry", () => {
		const waiting = {
			workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] }],
		};

		expect(rowsOf(waiting, { s1: "needs-attention" }, { s1: "Needs permission" })[0]?.trace).toBe("Needs permission");
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
		trace: undefined,
		traceSince: undefined,
		attention: undefined,
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

describe("choosing what the trace slot says", () => {
	test("a working agent shows what it is doing", () => {
		expect(sessionTrace("working", "Running commands")).toBe("Running commands");
	});

	test("a finished agent names its state, whatever the transcript last held", () => {
		expect(sessionTrace("done-unseen", "Writing")).toBe("Done");
		expect(sessionTrace("done-unseen")).toBe("Done");
	});

	test("a waiting agent shows the reason it was handed, not the transcript's stale verb", () => {
		expect(sessionTrace("needs-attention", "Needs permission")).toBe("Needs permission");
	});

	test("no activity means no trace, even with a line on hand", () => {
		expect(sessionTrace(undefined, "vite ready in 412 ms")).toBeUndefined();
	});

	test("a working shell nobody is tracing still says it is working", () => {
		expect(sessionTrace("working")).toBe("Working");
	});
});

describe("choosing what the clock beside the trace counts from", () => {
	test("a working agent counts from the trace, not from the turn it opened", () => {
		expect(sessionSince({ activity: "working", traceSince: NOW - 6000, statusSince: NOW - 93_000 }))
			.toBe(NOW - 6000);
	});

	test("a finished agent counts from the end of its turn", () => {
		expect(sessionSince({ activity: "done-unseen", traceSince: NOW - 6000, statusSince: NOW - 1000 }))
			.toBe(NOW - 1000);
	});

	test("a trace with no moment of its own falls back to the harness clock", () => {
		expect(sessionSince({ activity: "working", traceSince: undefined, statusSince: NOW - 93_000 }))
			.toBe(NOW - 93_000);
	});

	test("no activity means no clock", () => {
		expect(sessionSince({ activity: undefined, traceSince: NOW - 6000, statusSince: NOW - 93_000 }))
			.toBeUndefined();
	});
});
