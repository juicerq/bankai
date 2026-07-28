import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
	ATTENTION_SKEW_MS,
	attentionEntryShells,
	clockSince,
	freshAttention,
	nextCompactionAnchor,
	nextShellActivity,
	nextShellWorktrees,
	sessionTraces,
	type ShellTrace,
	snapshotsByProject,
	turnBaselineShells,
	turnEnded,
	turnStartShells,
} from "@main/activity/AgentActivity";
import type { HarnessTrace } from "@main/activity/Harness";
import { ClaudeHarness, parseSessionRecord, WAITING_TRACE_FALLBACK } from "@main/activity/claude";
import { COMPACTION_TRACE, matchesCompactionNotice } from "@main/activity/compaction";
import { procFs } from "@main/activity/procFs";
import { bindShells, type ParentOf } from "@main/activity/SessionBinder";
import { shellArgs } from "@main/terminal/commandLine";
import { aggregateActivity, type AgentActivityState } from "@shared/activity";

const BUSY_RECORD =
	'{"pid":141653,"sessionId":"67af1e51-358c-475f-b33a-7de1e199d0a5","cwd":"/home/jui/projects/bankai-2","startedAt":1784894292497,"procStart":"215800","version":"2.1.220","kind":"interactive","status":"busy","updatedAt":1784901075701,"statusUpdatedAt":1784901075701}';
const IDLE_RECORD =
	'{"pid":336333,"sessionId":"5daa2868-d467-4a46-b335-cd6405f22327","cwd":"/home/jui/dogama/app","startedAt":1784896966459,"procStart":"483184","version":"2.1.220","kind":"interactive","status":"idle","updatedAt":1784901169072,"statusUpdatedAt":1784901169072}';
const WAITING_RECORD =
	'{"pid":141653,"sessionId":"67af1e51-358c-475f-b33a-7de1e199d0a5","cwd":"/home/jui/projects/bankai-2","startedAt":1784894292497,"procStart":"215800","version":"2.1.220","kind":"interactive","status":"waiting","waitingFor":"permission prompt","updatedAt":1784901075701,"statusUpdatedAt":1784901075701}';

describe("shell activity transitions", () => {
	test("a bound working agent yields working regardless of prior state", () => {
		expect(nextShellActivity(undefined, "working", false)).toBe("working");
		expect(nextShellActivity("done-unseen", "working", false)).toBe("working");
	});

	test("a turn finishing (working then idle) yields done-unseen", () => {
		expect(nextShellActivity("working", "idle", false)).toBe("done-unseen");
	});

	test("an idle agent with no observed turn yields no activity", () => {
		expect(nextShellActivity(undefined, "idle", false)).toBeUndefined();
	});

	test("done-unseen persists while the agent rests or disappears", () => {
		expect(nextShellActivity("done-unseen", "idle", false)).toBe("done-unseen");
		expect(nextShellActivity("done-unseen", undefined, false)).toBe("done-unseen");
	});

	test("killing the agent mid-turn removes the working signal", () => {
		expect(nextShellActivity("working", undefined, false)).toBeUndefined();
	});

	test("viewing the shell clears done-unseen, including as the turn completes", () => {
		expect(nextShellActivity("done-unseen", "idle", true)).toBeUndefined();
		expect(nextShellActivity("working", "idle", true)).toBeUndefined();
	});

	test("viewing a still-working shell keeps it working", () => {
		expect(nextShellActivity("working", "working", true)).toBe("working");
	});
});

describe("needs-attention", () => {
	test("a prompt while the agent waits mid-turn yields needs-attention", () => {
		expect(nextShellActivity("working", "waiting", false)).toBe("needs-attention");
	});

	test("needs-attention persists across ticks while still waiting", () => {
		expect(nextShellActivity("needs-attention", "waiting", false)).toBe("needs-attention");
	});

	test("answering the prompt returns the shell to working as the turn continues", () => {
		expect(nextShellActivity("needs-attention", "working", false)).toBe("working");
	});

	test("answering into a finished turn hands off to done-unseen", () => {
		expect(nextShellActivity("needs-attention", "idle", false)).toBe("done-unseen");
	});

	test("a waiting agent needs attention even on the first tick that sees it", () => {
		expect(nextShellActivity(undefined, "waiting", false)).toBe("needs-attention");
	});

	test("reading the shell does not dismiss a prompt that is still open", () => {
		expect(nextShellActivity("needs-attention", "waiting", true)).toBe("needs-attention");
	});
});

describe("the harness reporting the end of its own turn", () => {
	const working = { status: "working", statusSince: 1784901075701 } as const;

	test("an end newer than the reported status finishes the turn before the poll sees it", () => {
		expect(turnEnded(working, 1784901076200)).toBe(true);
		expect(nextShellActivity("working", "idle", false)).toBe("done-unseen");
	});

	test("the end of the previous turn does not finish the one running now", () => {
		expect(turnEnded(working, 1784901075000)).toBe(false);
	});

	test("a shell with no end reported keeps the status the poll found", () => {
		expect(turnEnded(working)).toBe(false);
		expect(turnEnded(undefined, 1784901076200)).toBe(false);
	});

	test("an open prompt outranks the end of a turn", () => {
		expect(turnEnded({ status: "waiting", statusSince: 1784901075701 }, 1784901076200)).toBe(false);
	});
});

describe("project aggregation", () => {
	test("picks the most urgent state among shells", () => {
		expect(aggregateActivity(["working", "done-unseen"])).toBe("done-unseen");
		expect(aggregateActivity(["done-unseen", "needs-attention", "working"])).toBe("needs-attention");
		expect(aggregateActivity(["working", "working"])).toBe("working");
	});

	test("no shells means no project signal", () => {
		expect(aggregateActivity([])).toBeNull();
	});
});

describe("shell turns", () => {
	function shells(states: Record<string, AgentActivityState>) {
		return new Map<string, AgentActivityState>(Object.entries(states));
	}

	test("a shell that starts working opens its own turn", () => {
		expect(turnStartShells(shells({}), shells({ a: "working" }))).toEqual(["a"]);
	});

	test("a shell staying in its turn does not open another", () => {
		expect(turnStartShells(shells({ a: "working" }), shells({ a: "working" }))).toEqual([]);
	});

	test("a shell blocked on the user keeps the turn it is already in open", () => {
		expect(turnStartShells(shells({ a: "working" }), shells({ a: "needs-attention" }))).toEqual([]);
	});

	test("working again after the shell went quiet opens a new turn", () => {
		expect(turnStartShells(shells({ a: "done-unseen" }), shells({ a: "working" }))).toEqual(["a"]);
	});

	test("finished work waiting to be seen never opens a turn", () => {
		expect(turnStartShells(shells({}), shells({ a: "done-unseen" }))).toEqual([]);
	});

	test("a sibling shell opens its turn without touching the one already working", () => {
		const before = shells({ a: "working" });
		const after = shells({ a: "working", b: "working", c: "needs-attention" });

		expect(turnStartShells(before, after)).toEqual(["b", "c"]);
	});

	test("a working shell that blocks on the user enters needs attention", () => {
		expect(attentionEntryShells(shells({ a: "working" }), shells({ a: "needs-attention" }))).toEqual(["a"]);
	});

	test("a shell already blocked on the user does not enter it again", () => {
		expect(attentionEntryShells(shells({ a: "needs-attention" }), shells({ a: "needs-attention" }))).toEqual([]);
	});

	test("a shell that resumes working left needs attention behind", () => {
		expect(attentionEntryShells(shells({ a: "needs-attention" }), shells({ a: "working" }))).toEqual([]);
	});

	test("only the shell that blocked enters needs attention", () => {
		const before = shells({ a: "needs-attention", b: "working" });
		const after = shells({ a: "needs-attention", b: "needs-attention", c: "working" });

		expect(attentionEntryShells(before, after)).toEqual(["b"]);
	});
});

describe("shell worktrees", () => {
	const owners = new Map([
		["session-a", { projectId: "p1", shellId: "shell-a" }],
		["session-b", { projectId: "p1", shellId: "shell-b" }],
	]);

	function states(entries: Record<string, AgentActivityState>) {
		return new Map<string, AgentActivityState>(Object.entries(entries));
	}

	test("an agent that entered a worktree binds its shell to it", () => {
		expect(nextShellWorktrees(new Map(), [{ shellId: "shell-a", worktree: "/tmp/repo-slug" }])).toEqual(
			new Map([["shell-a", "/tmp/repo-slug"]]),
		);
	});

	test("a shell keeps its worktree after the agent exits", () => {
		const previous = new Map([["shell-a", "/tmp/repo-slug"]]);

		expect(nextShellWorktrees(previous, [{ shellId: "shell-a" }])).toEqual(previous);
	});

	test("a closed shell drops its worktree", () => {
		const previous = new Map([["shell-a", "/tmp/repo-slug"]]);

		expect(nextShellWorktrees(previous, [{ shellId: "shell-b" }])).toEqual(new Map());
	});

	test("a shell that leaves for another worktree follows the agent", () => {
		const previous = new Map([["shell-a", "/tmp/repo-slug"]]);

		expect(nextShellWorktrees(previous, [{ shellId: "shell-a", worktree: "/tmp/repo-other" }])).toEqual(
			new Map([["shell-a", "/tmp/repo-other"]]),
		);
	});

	test("a turn opening captures its baseline in the shell's worktree", () => {
		const baselines = turnBaselineShells({
			before: states({}),
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
		});

		expect(baselines).toEqual([{ owner: { projectId: "p1", shellId: "shell-a" }, worktree: "/tmp/repo-slug" }]);
	});

	test("a turn opening outside any worktree captures the project itself", () => {
		const baselines = turnBaselineShells({
			before: states({}),
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map(),
		});

		expect(baselines).toEqual([{ owner: { projectId: "p1", shellId: "shell-a" } }]);
	});

	test("an agent that creates its worktree mid-turn re-captures the baseline there", () => {
		const baselines = turnBaselineShells({
			before: states({ "session-a": "working" }),
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
		});

		expect(baselines).toEqual([{ owner: { projectId: "p1", shellId: "shell-a" }, worktree: "/tmp/repo-slug" }]);
	});

	test("a settled worktree does not re-capture the baseline on every tick", () => {
		const worktrees = new Map([["shell-a", "/tmp/repo-slug"]]);
		const baselines = turnBaselineShells({
			before: states({ "session-a": "working" }),
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: worktrees,
			worktrees,
		});

		expect(baselines).toEqual([]);
	});

	test("a worktree appearing outside a turn does not capture a baseline", () => {
		const baselines = turnBaselineShells({
			before: states({}),
			after: states({}),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
		});

		expect(baselines).toEqual([]);
	});
});

describe("project snapshots", () => {
	const owners = new Map([
		["session-a", { projectId: "p1", shellId: "shell-a" }],
		["session-b", { projectId: "p1", shellId: "shell-b" }],
		["session-c", { projectId: "p2", shellId: "shell-c" }],
	]);

	function states(entries: Record<string, AgentActivityState>) {
		return new Map<string, AgentActivityState>(Object.entries(entries));
	}

	test("gathers a project's shells under it", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-b": "needs-attention" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.get("p1")).toEqual({
			shells: { "shell-a": "working", "shell-b": "needs-attention" },
			worktreeByShellId: {},
			traceByShellId: {},
			traceSinceByShellId: {},
			statusSinceByShellId: {},
			attentionByShellId: {},
		});
	});

	test("keeps each project's shells to itself", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-c": "done-unseen" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect([...snapshots.keys()].sort()).toEqual(["p1", "p2"]);
		expect(snapshots.get("p2")).toEqual({
			shells: { "shell-c": "done-unseen" },
			worktreeByShellId: {},
			traceByShellId: {},
			traceSinceByShellId: {},
			statusSinceByShellId: {},
			attentionByShellId: {},
		});
	});

	test("ignores an agent no shell owns", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-loose": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.size).toBe(1);
		expect(snapshots.get("p1")?.shells).toEqual({ "shell-a": "working" });
	});

	test("keys both states and worktrees by the persistent shell id", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
			traces: new Map(),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.get("p1")).toEqual({
			shells: { "shell-a": "working" },
			worktreeByShellId: { "shell-a": "/tmp/repo-slug" },
			traceByShellId: {},
			traceSinceByShellId: {},
			statusSinceByShellId: {},
			attentionByShellId: {},
		});
	});

	test("a shell with no live agent gets no entry under its own id", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.get("p1")?.shells["shell-b"]).toBeUndefined();
	});

	test("a project whose only news is a worktree still gets a snapshot", () => {
		const snapshots = snapshotsByProject({
			shellStates: new Map(),
			owners,
			worktrees: new Map([["shell-c", "/tmp/repo-slug"]]),
			traces: new Map(),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.get("p2")).toEqual({
			shells: {},
			worktreeByShellId: { "shell-c": "/tmp/repo-slug" },
			traceByShellId: {},
			traceSinceByShellId: {},
			statusSinceByShellId: {},
			attentionByShellId: {},
		});
	});

	test("the last output line rides along for a shell that has activity", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map([
				["shell-a", { label: "Running bun run check" }],
				["shell-b", { label: "vite ready in 412 ms" }],
			]),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.get("p1")?.traceByShellId).toEqual({ "shell-a": "Running bun run check" });
	});

	test("the moment the trace became true rides along beside its label", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map([
				["shell-a", { label: "Thinking", since: 1784901075701 }],
				["shell-b", { label: "Thinking", since: 1784901169072 }],
			]),
			statusSince: new Map(),
			attention: new Map(),
		});

		expect(snapshots.get("p1")?.traceSinceByShellId).toEqual({ "shell-a": 1784901075701 });
	});

	test("the moment the status changed rides along for a shell that has activity", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
			statusSince: new Map([["shell-a", 1784901075701], ["shell-b", 1784901169072]]),
			attention: new Map(),
		});

		expect(snapshots.get("p1")?.statusSinceByShellId).toEqual({ "shell-a": 1784901075701 });
	});

	test("no bound shells means no snapshots at all", () => {
		expect(snapshotsByProject({ shellStates: new Map(), owners, worktrees: new Map(), traces: new Map(), statusSince: new Map(), attention: new Map() }).size).toBe(0);
	});
});

describe("what a card says and since when", () => {
	const TICK = 1784901180000;

	function traced(input: {
		compacting?: string[];
		harnessTraces?: [string, HarnessTrace][];
		waitingFor?: [string, string][];
		statusSince?: [string, number][];
		outputLines?: [string, string][];
		agentShells?: string[];
		held?: [string, ShellTrace][];
		now?: number;
	}) {
		return sessionTraces({
			compacting: new Set(input.compacting ?? []),
			harnessTraces: new Map(input.harnessTraces ?? []),
			waitingFor: new Map(input.waitingFor ?? []),
			statusSince: new Map(input.statusSince ?? []),
			outputLines: new Map(input.outputLines ?? []),
			agentShells: new Set(input.agentShells ?? []),
			held: new Map(input.held ?? []),
			now: input.now ?? TICK,
		});
	}

	test("a shell with an agent in it never shows its own output line", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Running commands", recordId: "uuid-1" }]],
			outputLines: [["shell-a", "-7"], ["shell-b", "vite ready in 412 ms"], ["shell-c", "5"]],
			agentShells: ["shell-a", "shell-c"],
		});

		expect(traces.get("shell-a")?.label).toBe("Running commands");
		expect(traces.get("shell-b")?.label).toBe("vite ready in 412 ms");
		expect(traces.has("shell-c")).toBe(false);
	});

	test("a waiting reason wins over the transcript, which still names the last finished block", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Running commands", recordId: "uuid-1" }]],
			waitingFor: [["shell-a", "Needs permission"]],
			agentShells: ["shell-a"],
		});

		expect(traces.get("shell-a")?.label).toBe("Needs permission");
	});

	test("compacting wins over the transcript, which is frozen while it runs", () => {
		const traces = traced({
			compacting: ["shell-a"],
			harnessTraces: [
				["shell-a", { label: "Running commands", recordId: "uuid-1" }],
				["shell-b", { label: "Thinking", recordId: "uuid-2" }],
			],
			outputLines: [["shell-a", "-7"]],
			agentShells: ["shell-a", "shell-b"],
		});

		expect(traces.get("shell-a")?.label).toBe(COMPACTION_TRACE);
		expect(traces.get("shell-b")?.label).toBe("Thinking");
	});

	test("a label seen for the first time counts from the record that produced it", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Thinking", recordId: "uuid-1", since: TICK - 4000 }]],
			agentShells: ["shell-a"],
		});

		expect(traces.get("shell-a")).toEqual({ label: "Thinking", since: TICK - 4000 });
	});

	test("a record with no timestamp counts from the tick that observed it", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Thinking", recordId: "uuid-1" }]],
			agentShells: ["shell-a"],
		});

		expect(traces.get("shell-a")).toEqual({ label: "Thinking", since: TICK });
	});

	test("a new record carrying the same label does not restart the count", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Thinking", recordId: "uuid-2", since: TICK - 1000 }]],
			agentShells: ["shell-a"],
			held: [["shell-a", { label: "Thinking", since: TICK - 44_000 }]],
		});

		expect(traces.get("shell-a")).toEqual({ label: "Thinking", since: TICK - 44_000 });
	});

	test("a label that changed adopts its own record's moment", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Editing claudeTrace.ts", recordId: "uuid-3", since: TICK - 3000 }]],
			agentShells: ["shell-a"],
			held: [["shell-a", { label: "Thinking", since: TICK - 44_000 }]],
		});

		expect(traces.get("shell-a")).toEqual({ label: "Editing claudeTrace.ts", since: TICK - 3000 });
	});

	test("a session waiting on you counts from the moment it started waiting", () => {
		const traces = traced({
			harnessTraces: [["shell-a", { label: "Running commands", recordId: "uuid-1", since: TICK - 9000 }]],
			waitingFor: [["shell-a", "Needs permission"]],
			statusSince: [["shell-a", TICK - 2000]],
			agentShells: ["shell-a"],
		});

		expect(traces.get("shell-a")).toEqual({ label: "Needs permission", since: TICK - 2000 });
	});

	test("compacting has no record behind it and counts from the tick that noticed", () => {
		const traces = traced({
			compacting: ["shell-a"],
			harnessTraces: [["shell-a", { label: "Running commands", recordId: "uuid-1", since: TICK - 90_000 }]],
			agentShells: ["shell-a"],
		});

		expect(traces.get("shell-a")).toEqual({ label: COMPACTION_TRACE, since: TICK });
	});
});

describe("shell to agent binding", () => {
	function chain(edges: [number, number][] = []): ParentOf {
		const parents = new Map(edges);

		return (pid) => Promise.resolve(parents.get(pid) ?? null);
	}

	test("binds an agent the shell launched itself", async () => {
		const bindings = await bindShells(
			[{ sessionId: "shell-a", pid: 100 }],
			[200],
			chain([[200, 100]]),
		);
		expect(bindings.get("shell-a")).toBe(200);
	});

	test("binds an agent sitting further down the shell's tree", async () => {
		const bindings = await bindShells(
			[{ sessionId: "shell-a", pid: 100 }],
			[300],
			chain([[300, 250], [250, 100]]),
		);
		expect(bindings.get("shell-a")).toBe(300);
	});

	test("does not bind a shell with no agent under it, nor an agent outside every shell", async () => {
		const bindings = await bindShells(
			[{ sessionId: "empty", pid: 100 }],
			[300],
			chain([[300, 900], [900, 1]]),
		);
		expect(bindings.size).toBe(0);
	});

	test("prefers the agent nearest the shell over one nested below it", async () => {
		const bindings = await bindShells(
			[{ sessionId: "shell-a", pid: 100 }],
			[400, 200],
			chain([[200, 100], [400, 300], [300, 200]]),
		);
		expect(bindings.get("shell-a")).toBe(200);
	});

	test("gives each shell the agent under it", async () => {
		const bindings = await bindShells(
			[{ sessionId: "shell-a", pid: 100 }, { sessionId: "shell-b", pid: 101 }],
			[200, 201],
			chain([[200, 100], [201, 101]]),
		);
		expect(bindings).toEqual(new Map([["shell-a", 200], ["shell-b", 201]]));
	});

	test("stops walking a parent chain that cycles back on itself", async () => {
		const bindings = await bindShells(
			[{ sessionId: "shell-a", pid: 100 }],
			[200],
			chain([[200, 250], [250, 200]]),
		);
		expect(bindings.size).toBe(0);
	});

	test("stops at init rather than binding pid 1", async () => {
		const bindings = await bindShells(
			[{ sessionId: "init", pid: 1 }],
			[200],
			chain([[200, 1]]),
		);
		expect(bindings.size).toBe(0);
	});
});

describe.if(process.platform === "linux")("binding against real processes", () => {
	test("walks up from a live pid to the process that spawned it", async () => {
		const parent = await procFs.parent(process.pid);
		if (parent === null) {
			throw new Error("this test process has no parent to bind to");
		}

		const bindings = await bindShells([{ sessionId: "shell-a", pid: parent }], [process.pid], procFs.parent);
		expect(bindings).toEqual(new Map([["shell-a", process.pid]]));
	});

	test("reports no parent for a pid that does not exist", async () => {
		expect(await procFs.parent(0x7f_ff_ff_ff)).toBeNull();
	});

	test("binds a harness launched the way a pane launches it", async () => {
		const shell = "/bin/sh";
		const pane = Bun.spawn([shell, ...shellArgs(shell, "sleep 30")], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		try {
			await Bun.sleep(300);
			const listed = await new Response(Bun.spawn(["pgrep", "-P", String(pane.pid)]).stdout).text();
			const harness = Number(listed.trim().split("\n")[0]);
			expect(harness).toBeGreaterThan(0);

			const bindings = await bindShells([{ sessionId: "pane", pid: pane.pid }], [harness], procFs.parent);
			expect(bindings).toEqual(new Map([["pane", harness]]));
		} finally {
			Bun.spawnSync(["pkill", "-9", "-P", String(pane.pid)]);
			pane.kill("SIGKILL");
			await pane.exited;
		}
	});
});

describe("claude session registry parsing", () => {
	test("maps a busy record to a working presence", () => {
		const presence = parseSessionRecord(BUSY_RECORD);
		expect(presence).toEqual({
			harness: "claude",
			sessionId: "67af1e51-358c-475f-b33a-7de1e199d0a5",
			pid: 141653,
			procStart: "215800",
			cwd: "/home/jui/projects/bankai-2",
			status: "working",
			statusSince: 1784901075701,
		});
	});

	test("a shell status is an agent still working, not an idle one", () => {
		const record = BUSY_RECORD.replace('"status":"busy"', '"status":"shell"');
		expect(parseSessionRecord(record)?.status).toBe("working");
	});

	test("maps an unknown status to idle rather than inventing a state", () => {
		expect(parseSessionRecord(IDLE_RECORD)?.status).toBe("idle");
		expect(parseSessionRecord(BUSY_RECORD.replace('"status":"busy"', '"status":"warping"'))?.status).toBe("idle");
	});

	test("statusSince carries the registry's own turn clock", () => {
		expect(parseSessionRecord(IDLE_RECORD)?.statusSince).toBe(1784901169072);
	});

	test("a record with no status timestamp still parses, with no clock to show", () => {
		expect(parseSessionRecord(BUSY_RECORD.replace(/,"statusUpdatedAt":\d+/, ""))?.statusSince).toBeUndefined();
	});

	test("rejects malformed or incomplete records", () => {
		expect(parseSessionRecord("not json")).toBeNull();
		expect(parseSessionRecord('{"pid":1}')).toBeNull();
	});

	function publishedNameOf(fields: { name?: string; nameSource?: string }): string | undefined {
		const busy: object = JSON.parse(BUSY_RECORD);

		return parseSessionRecord(JSON.stringify({ ...busy, ...fields }))?.publishedName;
	}

	test("a name the session or the user gave it reaches the presence", () => {
		expect(publishedNameOf({ name: "revisar o sidebar", nameSource: "auto" })).toBe("revisar o sidebar");
		expect(publishedNameOf({ name: "revisar o sidebar", nameSource: "user" })).toBe("revisar o sidebar");
	});

	test("a name derived from the working directory never reaches the presence", () => {
		expect(publishedNameOf({ name: "bankai-2-94", nameSource: "derived" })).toBeUndefined();
	});

	test("a name with no source behind it never reaches the presence", () => {
		expect(publishedNameOf({ name: "bankai-2-94" })).toBeUndefined();
	});

	test("a blank published name is no name at all", () => {
		expect(publishedNameOf({ name: "   ", nameSource: "auto" })).toBeUndefined();
	});
});

describe("claude harness discovery", () => {
	let configDir: string | undefined;

	afterEach(() => {
		if (configDir) {
			rmSync(configDir, { recursive: true, force: true });
			configDir = undefined;
		}
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	test("discovers valid session records from the registry directory", async () => {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		const sessions = join(configDir, "sessions");
		mkdirSync(sessions);
		writeFileSync(join(sessions, "141653.json"), BUSY_RECORD);
		writeFileSync(join(sessions, "336333.json"), IDLE_RECORD);
		writeFileSync(join(sessions, "broken.json"), "not json");
		process.env.CLAUDE_CONFIG_DIR = configDir;

		const presences = await ClaudeHarness.discover();

		expect(presences.map((presence) => presence.sessionId).sort()).toEqual([
			"5daa2868-d467-4a46-b335-cd6405f22327",
			"67af1e51-358c-475f-b33a-7de1e199d0a5",
		]);
	});

	test("yields nothing when the registry directory is absent", async () => {
		process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "claude-config-missing-xyz");
		expect(await ClaudeHarness.discover()).toEqual([]);
	});
});

describe("what the agent is waiting for", () => {
	function waitingFor(reason: string): string | undefined {
		return parseSessionRecord(WAITING_RECORD.replace('"permission prompt"', JSON.stringify(reason)))?.waitingFor;
	}

	test("a permission prompt reads as needing permission", () => {
		expect(parseSessionRecord(WAITING_RECORD)?.waitingFor).toBe("Needs permission");
	});

	test("each reason the registry writes gets its own label", () => {
		expect(waitingFor("sandbox request")).toBe("Needs permission");
		expect(waitingFor("input needed")).toBe("Needs input");
		expect(waitingFor("worker request")).toBe("Needs input");
		expect(waitingFor("dialog open")).toBe("Waiting on you");
	});

	test("a reason this version has never seen still says the agent is stopped", () => {
		expect(waitingFor("holodeck request")).toBe(WAITING_TRACE_FALLBACK);
	});

	test("a waiting record with no reason at all still says the agent is stopped", () => {
		const record = WAITING_RECORD.replace(',"waitingFor":"permission prompt"', "");
		expect(parseSessionRecord(record)?.waitingFor).toBe(WAITING_TRACE_FALLBACK);
	});

	test("an agent that is not waiting carries no reason", () => {
		expect(parseSessionRecord(BUSY_RECORD)?.waitingFor).toBeUndefined();
		const stray = BUSY_RECORD.replace('"status":"busy"', '"status":"busy","waitingFor":"permission prompt"');
		expect(parseSessionRecord(stray)?.waitingFor).toBeUndefined();
	});
});

describe("how long a compaction lasts", () => {
	const WORKING = { bound: "working", noticed: false, recordId: "uuid-1" } as const;

	test("the notice anchors on the record the transcript stopped at", () => {
		expect(nextCompactionAnchor({ ...WORKING, anchor: undefined, noticed: true })).toBe("uuid-1");
	});

	test("it holds for as long as the transcript stays frozen", () => {
		expect(nextCompactionAnchor({ ...WORKING, anchor: "uuid-1" })).toBe("uuid-1");
	});

	test("it ends when the agent writes its next record", () => {
		expect(nextCompactionAnchor({ ...WORKING, anchor: "uuid-1", recordId: "uuid-2" })).toBeUndefined();
	});

	test("it ends when the turn ends, even with the transcript still frozen", () => {
		expect(nextCompactionAnchor({ ...WORKING, anchor: "uuid-1", bound: "idle" })).toBeUndefined();
		expect(nextCompactionAnchor({ ...WORKING, anchor: "uuid-1", bound: undefined })).toBeUndefined();
	});

	test("a shell that never saw the notice is never compacting", () => {
		expect(nextCompactionAnchor({ ...WORKING, anchor: undefined })).toBeUndefined();
	});

	test("a session with no transcript record yet still ends on the first one", () => {
		const anchor = nextCompactionAnchor({ bound: "working", noticed: true, recordId: undefined, anchor: undefined });

		expect(nextCompactionAnchor({ bound: "working", noticed: false, recordId: undefined, anchor })).toBe(anchor);
		expect(nextCompactionAnchor({ bound: "working", noticed: false, recordId: "uuid-1", anchor })).toBeUndefined();
	});
});

describe("compaction notice in the terminal stream", () => {
	test("matches the spinner line the harness paints while it compacts", () => {
		expect(matchesCompactionNotice("✳ Compacting conversation… (esc to interrupt · 42s)")).toBe(true);
	});

	test("matches the shimmer repaint that colours the message one character at a time", () => {
		const shimmer = "Compacting conversation"
			.split("")
			.map((char, index) => `\x1b[38;5;${117 + (index % 3)}m${char}\x1b[39m`)
			.join("");

		expect(matchesCompactionNotice(`\x1b[2K\r✳ ${shimmer}\x1b[0m`)).toBe(true);
	});

	test("matches across the line break a repaint puts between the two words", () => {
		expect(matchesCompactionNotice("✳ Compacting\r\n  conversation…")).toBe(true);
	});

	test("ignores ordinary output that never names the harness's own notice", () => {
		expect(matchesCompactionNotice("$ bun run build\r\n✓ built in 1.42s\r\n")).toBe(false);
		expect(matchesCompactionNotice("Compacted 12 files into one bundle")).toBe(false);
	});
});

describe("how long the card has held its state", () => {
	test("a state that did not change keeps the clock it was already showing", () => {
		expect(clockSince({ previous: "working", next: "working", held: 1000, reported: 5000 })).toBe(1000);
	});

	test("a busy agent dropping into a shell does not restart the clock", () => {
		expect(clockSince({ previous: "working", next: "working", held: 1000, reported: 9000 })).toBe(1000);
	});

	test("a state that changed adopts the moment the harness reported", () => {
		expect(clockSince({ previous: "working", next: "done-unseen", held: 1000, reported: 9000 })).toBe(9000);
	});

	test("a shell seen for the first time takes the harness clock", () => {
		expect(clockSince({ previous: undefined, next: "working", held: undefined, reported: 9000 })).toBe(9000);
	});

	test("a harness with no clock leaves the card without one", () => {
		expect(clockSince({ previous: undefined, next: "working", held: undefined, reported: undefined })).toBeUndefined();
	});
});

describe("labelling the wait the phone is looking at", () => {
	const WAIT_STARTED = 1784901075701;
	const ASKING = { message: "Claude needs your permission to use Bash", at: WAIT_STARTED + 40 };

	test("a notification from this wait labels it", () => {
		expect(freshAttention({ attention: ASKING, bound: "waiting", statusSince: WAIT_STARTED })).toEqual(ASKING);
	});

	test("a notification left over from an earlier wait is not offered", () => {
		const stale = { ...ASKING, at: WAIT_STARTED - ATTENTION_SKEW_MS - 1 };

		expect(freshAttention({ attention: stale, bound: "waiting", statusSince: WAIT_STARTED })).toBeUndefined();
	});

	test("a hook that ran just before the registry moved still counts as this wait", () => {
		const early = { ...ASKING, at: WAIT_STARTED - ATTENTION_SKEW_MS + 1 };

		expect(freshAttention({ attention: early, bound: "waiting", statusSince: WAIT_STARTED })).toEqual(early);
	});

	test("an agent that is not waiting has nothing to ask", () => {
		expect(freshAttention({ attention: ASKING, bound: "working", statusSince: WAIT_STARTED })).toBeUndefined();
		expect(freshAttention({ attention: undefined, bound: "waiting", statusSince: WAIT_STARTED })).toBeUndefined();
	});

	test("a wait with no clock trusts the notification it has", () => {
		expect(freshAttention({ attention: ASKING, bound: "waiting", statusSince: undefined })).toEqual(ASKING);
	});
});
