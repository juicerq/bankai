import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
	nextShellActivity,
	nextShellWorktrees,
	sessionTraces,
	snapshotsByProject,
	turnBaselineShells,
	turnStartShells,
} from "@main/activity/AgentActivity";
import { matchesAttentionPrompt } from "@main/activity/attention";
import { ClaudeHarness, parseSessionRecord } from "@main/activity/claude";
import { bindShells } from "@main/activity/SessionBinder";
import { aggregateActivity, type AgentActivityState } from "@shared/activity";

const BUSY_RECORD =
	'{"pid":141653,"sessionId":"67af1e51-358c-475f-b33a-7de1e199d0a5","cwd":"/home/jui/projects/bankai-2","startedAt":1784894292497,"procStart":"215800","version":"2.1.218","kind":"interactive","status":"busy","updatedAt":1784901075701}';
const IDLE_RECORD =
	'{"pid":336333,"sessionId":"5daa2868-d467-4a46-b335-cd6405f22327","cwd":"/home/jui/dogama/app","startedAt":1784896966459,"procStart":"483184","version":"2.1.218","kind":"interactive","status":"idle","updatedAt":1784901169072}';

describe("shell activity transitions", () => {
	test("a bound working agent yields working regardless of prior state", () => {
		expect(nextShellActivity(undefined, "working", false, false)).toBe("working");
		expect(nextShellActivity("done-unseen", "working", false, false)).toBe("working");
	});

	test("a turn finishing (working then idle) yields done-unseen", () => {
		expect(nextShellActivity("working", "idle", false, false)).toBe("done-unseen");
	});

	test("an idle agent with no observed turn yields no activity", () => {
		expect(nextShellActivity(undefined, "idle", false, false)).toBeUndefined();
	});

	test("done-unseen persists while the agent rests or disappears", () => {
		expect(nextShellActivity("done-unseen", "idle", false, false)).toBe("done-unseen");
		expect(nextShellActivity("done-unseen", undefined, false, false)).toBe("done-unseen");
	});

	test("killing the agent mid-turn removes the working signal", () => {
		expect(nextShellActivity("working", undefined, false, false)).toBeUndefined();
	});

	test("viewing the shell clears done-unseen, including as the turn completes", () => {
		expect(nextShellActivity("done-unseen", "idle", true, false)).toBeUndefined();
		expect(nextShellActivity("working", "idle", true, false)).toBeUndefined();
	});

	test("viewing a still-working shell keeps it working", () => {
		expect(nextShellActivity("working", "working", true, false)).toBe("working");
	});
});

describe("needs-attention", () => {
	test("a prompt while the agent waits mid-turn yields needs-attention", () => {
		expect(nextShellActivity("working", "waiting", false, true)).toBe("needs-attention");
	});

	test("needs-attention persists across ticks while still waiting", () => {
		expect(nextShellActivity("needs-attention", "waiting", false, true)).toBe("needs-attention");
	});

	test("answering the prompt returns the shell to working as the turn continues", () => {
		expect(nextShellActivity("needs-attention", "working", false, false)).toBe("working");
	});

	test("answering into a finished turn hands off to done-unseen", () => {
		expect(nextShellActivity("needs-attention", "idle", false, false)).toBe("done-unseen");
	});

	test("a waiting status without a recognized prompt never fabricates done-unseen", () => {
		expect(nextShellActivity("working", "waiting", false, false)).toBe("working");
		expect(nextShellActivity(undefined, "waiting", false, false)).toBeUndefined();
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
		});

		expect(snapshots.get("p1")).toEqual({
			shells: { "shell-a": "working", "shell-b": "needs-attention" },
			worktreeByShellId: {},
			traceByShellId: {},
		});
	});

	test("keeps each project's shells to itself", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-c": "done-unseen" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
		});

		expect([...snapshots.keys()].sort()).toEqual(["p1", "p2"]);
		expect(snapshots.get("p2")).toEqual({
			shells: { "shell-c": "done-unseen" },
			worktreeByShellId: {},
			traceByShellId: {},
		});
	});

	test("ignores an agent no shell owns", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-loose": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
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
		});

		expect(snapshots.get("p1")).toEqual({
			shells: { "shell-a": "working" },
			worktreeByShellId: { "shell-a": "/tmp/repo-slug" },
			traceByShellId: {},
		});
	});

	test("a shell with no live agent gets no entry under its own id", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map(),
		});

		expect(snapshots.get("p1")?.shells["shell-b"]).toBeUndefined();
	});

	test("a project whose only news is a worktree still gets a snapshot", () => {
		const snapshots = snapshotsByProject({
			shellStates: new Map(),
			owners,
			worktrees: new Map([["shell-c", "/tmp/repo-slug"]]),
			traces: new Map(),
		});

		expect(snapshots.get("p2")).toEqual({
			shells: {},
			worktreeByShellId: { "shell-c": "/tmp/repo-slug" },
			traceByShellId: {},
		});
	});

	test("the last output line rides along for a shell that has activity", () => {
		const snapshots = snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			traces: new Map([["shell-a", "Running bun run check"], ["shell-b", "vite ready in 412 ms"]]),
		});

		expect(snapshots.get("p1")?.traceByShellId).toEqual({ "shell-a": "Running bun run check" });
	});

	test("the harness status wins over the shell's own output line", () => {
		const traces = sessionTraces(
			new Map([["shell-a", "Running commands…"]]),
			new Map([["shell-a", "-7"], ["shell-b", "vite ready in 412 ms"]]),
		);

		expect(traces.get("shell-a")).toBe("Running commands…");
		expect(traces.get("shell-b")).toBe("vite ready in 412 ms");
	});

	test("no bound shells means no snapshots at all", () => {
		expect(snapshotsByProject({ shellStates: new Map(), owners, worktrees: new Map(), traces: new Map() }).size).toBe(0);
	});
});

describe("shell to agent binding", () => {
	test("binds a shell whose foreground group is the live agent pid", () => {
		const bindings = bindShells(
			[{ sessionId: "shell-a", pid: 100, foreground: 200 }],
			new Set([200]),
			new Map(),
		);
		expect(bindings.get("shell-a")).toBe(200);
	});

	test("walks the process tree to reach an agent below the foreground group", () => {
		const bindings = bindShells(
			[{ sessionId: "shell-a", pid: 100, foreground: 200 }],
			new Set([300]),
			new Map([[200, [250]], [250, [300]]]),
		);
		expect(bindings.get("shell-a")).toBe(300);
	});

	test("binds a directly spawned agent that leads its own tty session", () => {
		const bindings = bindShells(
			[{ sessionId: "shell-a", pid: 100, foreground: 100 }],
			new Set([100]),
			new Map(),
		);
		expect(bindings.get("shell-a")).toBe(100);
	});

	test("does not bind a shell sitting at its own prompt or with a dead agent", () => {
		const bindings = bindShells(
			[
				{ sessionId: "prompt", pid: 100, foreground: 100 },
				{ sessionId: "no-tty", pid: 101, foreground: null },
				{ sessionId: "no-agent", pid: 102, foreground: 500 },
			],
			new Set([300]),
			new Map(),
		);
		expect(bindings.size).toBe(0);
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
		});
	});

	test("maps any non-busy status to idle", () => {
		expect(parseSessionRecord(IDLE_RECORD)?.status).toBe("idle");
	});

	test("preserves the waiting status a prompt writes to the registry", () => {
		const record = BUSY_RECORD.replace('"status":"busy"', '"status":"waiting"');
		expect(parseSessionRecord(record)?.status).toBe("waiting");
	});

	test("rejects malformed or incomplete records", () => {
		expect(parseSessionRecord("not json")).toBeNull();
		expect(parseSessionRecord('{"pid":1}')).toBeNull();
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

describe("attention prompt detection", () => {
	const PERMISSION_PROMPT =
		"\x1b[1mBash command\x1b[22m\r\n\x1b[2m╭─────────────╮\x1b[22m\r\n" +
		"Do you want to proceed?\r\n  1. Yes\r\n  2. Yes, and don't ask again for git commands in this project\r\n" +
		"\x1b[36m❯ 3. No, and tell Claude what to do differently\x1b[39m\r\n";
	const EDIT_PROMPT =
		"Edit file src/index.ts\r\n  1. Yes\r\n  2. Yes, allow all edits during this session\r\n" +
		"\x1b[36m❯ 3. No, and tell Claude what to do differently \x1b[2m(esc)\x1b[22m\x1b[39m\r\n";
	const PLAN_PROMPT =
		"Claude has written up a plan and is ready to execute. Would you like to proceed?\r\n" +
		"  1. Yes, and auto-accept edits\r\n  2. Yes, and manually approve edits\r\n\x1b[36m❯ 3. No, keep planning\x1b[39m\r\n";

	test("matches a tool permission prompt", () => {
		expect(matchesAttentionPrompt(PERMISSION_PROMPT)).toBe(true);
	});

	test("matches an edit permission prompt", () => {
		expect(matchesAttentionPrompt(EDIT_PROMPT)).toBe(true);
	});

	test("matches a plan approval prompt", () => {
		expect(matchesAttentionPrompt(PLAN_PROMPT)).toBe(true);
	});

	test("ignores ordinary build, shell and TUI output", () => {
		expect(matchesAttentionPrompt("$ bun run build\r\n✓ built in 1.42s\r\n")).toBe(false);
		expect(matchesAttentionPrompt("jui@host ~/projects/bankai-2 (main) $ ")).toBe(false);
		expect(matchesAttentionPrompt("? Select a template › Vanilla\r\n  Vue\r\n  React\r\n")).toBe(false);
	});

	test("ignores the agent's own auto-accept footer while it works", () => {
		expect(matchesAttentionPrompt("\x1b[2m⏵⏵ auto-accept edits on (shift+tab to cycle)\x1b[22m")).toBe(false);
	});
});
