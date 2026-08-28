import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { ShellActivity } from "@main/agents/shell-activity";
import { ClaudeHarness, parseSessionRecord } from "@main/agents/harness/claude/claude-harness";
import { Harnesses } from "@main/agents/harness/harnesses";
import { ProcFs } from "@main/infra/proc-fs";
import { type ParentOf } from "@main/agents/session/session-binder";
import { SessionBinder } from "@main/agents/session/session-binder";
import { SHELL_ID_ENV, ShellAgents } from "@main/terminal/shell-agents";
import { ShellCommandLine } from "@main/terminal/shell-command-line";
import { environ, readerOf } from "./utils/proc-reader";
import { aggregateActivity, type AgentActivityState } from "@shared/activity";

const BUSY_RECORD =
	'{"pid":141653,"sessionId":"67af1e51-358c-475f-b33a-7de1e199d0a5","cwd":"/home/jui/projects/bankai","startedAt":1784894292497,"procStart":"215800","version":"2.1.220","kind":"interactive","status":"busy","updatedAt":1784901075701,"statusUpdatedAt":1784901075701}';
const IDLE_RECORD =
	'{"pid":336333,"sessionId":"5daa2868-d467-4a46-b335-cd6405f22327","cwd":"/home/jui/dogama/app","startedAt":1784896966459,"procStart":"483184","version":"2.1.220","kind":"interactive","status":"idle","updatedAt":1784901169072,"statusUpdatedAt":1784901169072}';

describe("shell activity transitions", () => {
	test("a bound working agent yields working regardless of prior state", () => {
		expect(ShellActivity.next(undefined, "working")).toBe("working");
		expect(ShellActivity.next("done", "working")).toBe("working");
	});

	test("a turn finishing (working then idle) yields done", () => {
		expect(ShellActivity.next("working", "idle")).toBe("done");
	});

	test("an idle agent with no observed turn yields no activity", () => {
		expect(ShellActivity.next(undefined, "idle")).toBeUndefined();
	});

	test("done persists while the agent rests or disappears", () => {
		expect(ShellActivity.next("done", "idle")).toBe("done");
		expect(ShellActivity.next("done")).toBe("done");
	});

	test("killing the agent mid-turn removes the working signal", () => {
		expect(ShellActivity.next("working")).toBeUndefined();
	});

});

describe("needs-attention", () => {
	test("a prompt while the agent waits mid-turn yields needs-attention", () => {
		expect(ShellActivity.next("working", "waiting")).toBe("needs-attention");
	});

	test("needs-attention persists across ticks while still waiting", () => {
		expect(ShellActivity.next("needs-attention", "waiting")).toBe("needs-attention");
	});

	test("answering the prompt returns the shell to working as the turn continues", () => {
		expect(ShellActivity.next("needs-attention", "working")).toBe("working");
	});

	test("answering into a finished turn hands off to done", () => {
		expect(ShellActivity.next("needs-attention", "idle")).toBe("done");
	});

	test("a waiting agent needs attention even on the first tick that sees it", () => {
		expect(ShellActivity.next(undefined, "waiting")).toBe("needs-attention");
	});

});

describe("project aggregation", () => {
	test("picks the most urgent state among shells", () => {
		expect(aggregateActivity(["working", "done"])).toBe("done");
		expect(aggregateActivity(["done", "needs-attention", "working"])).toBe("needs-attention");
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
		expect(ShellActivity.changes(shells({}), shells({ a: "working" })).started).toEqual(["a"]);
	});

	test("a shell staying in its turn does not open another", () => {
		expect(ShellActivity.changes(shells({ a: "working" }), shells({ a: "working" })).started).toEqual([]);
	});

	test("a shell blocked on the user keeps the turn it is already in open", () => {
		expect(ShellActivity.changes(shells({ a: "working" }), shells({ a: "needs-attention" })).started).toEqual([]);
	});

	test("working again after the shell went quiet opens a new turn", () => {
		expect(ShellActivity.changes(shells({ a: "done" }), shells({ a: "working" })).started).toEqual(["a"]);
	});

	test("finished work waiting for a decision never opens a turn", () => {
		expect(ShellActivity.changes(shells({}), shells({ a: "done" })).started).toEqual([]);
	});

	test("a sibling shell opens its turn without touching the one already working", () => {
		const before = shells({ a: "working" });
		const after = shells({ a: "working", b: "working", c: "needs-attention" });

		expect(ShellActivity.changes(before, after).started).toEqual(["b", "c"]);
	});

	test("a working shell that blocks on the user enters needs attention", () => {
		expect(ShellActivity.changes(shells({ a: "working" }), shells({ a: "needs-attention" })).needsAttention).toEqual(["a"]);
	});

	test("a shell already blocked on the user does not enter it again", () => {
		expect(ShellActivity.changes(shells({ a: "needs-attention" }), shells({ a: "needs-attention" })).needsAttention).toEqual([]);
	});

	test("a shell that resumes working left needs attention behind", () => {
		expect(ShellActivity.changes(shells({ a: "needs-attention" }), shells({ a: "working" })).needsAttention).toEqual([]);
	});

	test("only the shell that blocked enters needs attention", () => {
		const before = shells({ a: "needs-attention", b: "working" });
		const after = shells({ a: "needs-attention", b: "needs-attention", c: "working" });

		expect(ShellActivity.changes(before, after).needsAttention).toEqual(["b"]);
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
		expect(ShellActivity.nextWorktrees(new Map(), [{ shellId: "shell-a", worktree: "/tmp/repo-slug" }])).toEqual(
			new Map([["shell-a", "/tmp/repo-slug"]]),
		);
	});

	test("a shell keeps its worktree after the agent exits", () => {
		const previous = new Map([["shell-a", "/tmp/repo-slug"]]);

		expect(ShellActivity.nextWorktrees(previous, [{ shellId: "shell-a" }])).toEqual(previous);
	});

	test("a closed shell drops its worktree", () => {
		const previous = new Map([["shell-a", "/tmp/repo-slug"]]);

		expect(ShellActivity.nextWorktrees(previous, [{ shellId: "shell-b" }])).toEqual(new Map());
	});

	test("a shell that leaves for another worktree follows the agent", () => {
		const previous = new Map([["shell-a", "/tmp/repo-slug"]]);

		expect(ShellActivity.nextWorktrees(previous, [{ shellId: "shell-a", worktree: "/tmp/repo-other" }])).toEqual(
			new Map([["shell-a", "/tmp/repo-other"]]),
		);
	});

	test("a turn opening captures its baseline in the shell's worktree", () => {
		const baselines = ShellActivity.turnBaselines({
			started: ["session-a"],
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
		});

		expect(baselines).toEqual([{ owner: { projectId: "p1", shellId: "shell-a" }, worktree: "/tmp/repo-slug" }]);
	});

	test("a turn opening outside any worktree captures the project itself", () => {
		const baselines = ShellActivity.turnBaselines({
			started: ["session-a"],
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map(),
		});

		expect(baselines).toEqual([{ owner: { projectId: "p1", shellId: "shell-a" } }]);
	});

	test("an agent that creates its worktree mid-turn re-captures the baseline there", () => {
		const baselines = ShellActivity.turnBaselines({
			started: [],
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: new Map(),
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
		});

		expect(baselines).toEqual([{ owner: { projectId: "p1", shellId: "shell-a" }, worktree: "/tmp/repo-slug" }]);
	});

	test("a settled worktree does not re-capture the baseline on every tick", () => {
		const worktrees = new Map([["shell-a", "/tmp/repo-slug"]]);
		const baselines = ShellActivity.turnBaselines({
			started: [],
			after: states({ "session-a": "working" }),
			owners,
			previousWorktrees: worktrees,
			worktrees,
		});

		expect(baselines).toEqual([]);
	});

	test("a worktree appearing outside a turn does not capture a baseline", () => {
		const baselines = ShellActivity.turnBaselines({
			started: [],
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

	test("names the harness of every bound shell, even one with no state yet", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: new Map(),
			owners,
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map([["shell-a", "codex"]]),
			doneShells: new Map(),
		});

		expect(snapshots.get("p1")).toEqual({
			shells: {},
			worktreeByShellId: {},
			statusSinceByShellId: {},
			harnessByShellId: { "shell-a": "codex" },
		});
	});

	test("gathers a project's shells under it", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-b": "needs-attention" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.get("p1")).toEqual({
			shells: { "shell-a": "working", "shell-b": "needs-attention" },
			worktreeByShellId: {},
			statusSinceByShellId: {},
			harnessByShellId: {},
		});
	});

	test("keeps each project's shells to itself", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-c": "done" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map([["shell-c", { projectId: "p2", at: 1784901075701 }]]),
		});

		expect([...snapshots.keys()].sort()).toEqual(["p1", "p2"]);
		expect(snapshots.get("p2")).toEqual({
			shells: { "shell-c": "done" },
			worktreeByShellId: {},
			statusSinceByShellId: { "shell-c": 1784901075701 },
			harnessByShellId: {},
		});
	});

	test("ignores an agent no shell owns", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working", "session-loose": "working" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.size).toBe(1);
		expect(snapshots.get("p1")?.shells).toEqual({ "shell-a": "working" });
	});

	test("keys both states and worktrees by the persistent shell id", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map([["shell-a", "/tmp/repo-slug"]]),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.get("p1")).toEqual({
			shells: { "shell-a": "working" },
			worktreeByShellId: { "shell-a": "/tmp/repo-slug" },
			statusSinceByShellId: {},
			harnessByShellId: {},
		});
	});

	test("a shell with no live agent gets no entry under its own id", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.get("p1")?.shells["shell-b"]).toBeUndefined();
	});

	test("a project whose only news is a worktree still gets a snapshot", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: new Map(),
			owners,
			worktrees: new Map([["shell-c", "/tmp/repo-slug"]]),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.get("p2")).toEqual({
			shells: {},
			worktreeByShellId: { "shell-c": "/tmp/repo-slug" },
			statusSinceByShellId: {},
			harnessByShellId: {},
		});
	});

	test("the moment the status changed rides along for a shell that has activity", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map([["shell-a", 1784901075701], ["shell-b", 1784901169072]]),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.get("p1")?.statusSinceByShellId).toEqual({ "shell-a": 1784901075701 });
	});

	test("a persisted completion restores done without a bound shell", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: new Map(),
			owners: new Map(),
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map([["shell-c", { projectId: "p2", at: 1784901075701 }]]),
		});

		expect(snapshots.get("p2")).toEqual({
			shells: { "shell-c": "done" },
			worktreeByShellId: {},
			statusSinceByShellId: { "shell-c": 1784901075701 },
			harnessByShellId: {},
		});
	});

	test("live work outranks the prior persisted completion until its start is saved", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-a": "working" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map([["shell-a", 1784901169072]]),
			harnesses: new Map(),
			doneShells: new Map([["shell-a", { projectId: "p1", at: 1784901075701 }]]),
		});

		expect(snapshots.get("p1")?.shells).toEqual({ "shell-a": "working" });
		expect(snapshots.get("p1")?.statusSinceByShellId).toEqual({ "shell-a": 1784901169072 });
	});

	test("a live done transition waits for its durable completion before appearing", () => {
		const snapshots = ShellActivity.snapshotsByProject({
			shellStates: states({ "session-c": "done" }),
			owners,
			worktrees: new Map(),
			statusSince: new Map([["shell-c", 1784901075701]]),
			harnesses: new Map(),
			doneShells: new Map(),
		});

		expect(snapshots.size).toBe(0);
	});

	test("no bound shells means no snapshots at all", () => {
		expect(ShellActivity.snapshotsByProject({
			shellStates: new Map(),
			owners,
			worktrees: new Map(),
			statusSince: new Map(),
			harnesses: new Map(),
			doneShells: new Map(),
		}).size).toBe(0);
	});
});

describe("durable done state", () => {
	test("takes only open completed shells and their original completion time", () => {
		const done = ShellActivity.doneShells({
			workspaces: [
				{
					projectId: "p1",
					shells: [
						{ id: "open", label: "open", createdAt: 1, doneAt: 10 },
						{ id: "idle", label: "idle", createdAt: 2 },
						{ id: "archived", label: "archived", createdAt: 3, doneAt: 20, archivedAt: 30 },
					],
				},
			],
		});

		expect(done).toEqual(new Map([["open", { projectId: "p1", at: 10 }]]));
	});
});

describe("shell to agent binding", () => {
	function chain(edges: [number, number][] = []): ParentOf {
		const parents = new Map(edges);

		return (pid) => Promise.resolve(parents.get(pid) ?? null);
	}

	const unstamped = readerOf({});

	test("binds an agent the shell launched itself", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: 100 }],
			agents: [200],
			parentOf: chain([[200, 100]]),
			reader: unstamped,
		});
		expect(bindings.get("session-a")).toBe(200);
	});

	test("binds an agent setsid orphaned, by the shell id stamped in its environment", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: 100 }],
			agents: [200],
			parentOf: chain([[200, 1]]),
			reader: readerOf({ 200: environ({ [SHELL_ID_ENV]: "shell-a" }) }),
		});

		expect(bindings.get("session-a")).toBe(200);
	});

	test("does not bind an agent stamped with another shell's id", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: 100 }],
			agents: [200],
			parentOf: chain([[200, 1]]),
			reader: readerOf({ 200: environ({ [SHELL_ID_ENV]: "shell-b" }) }),
		});

		expect(bindings.size).toBe(0);
	});

	test("prefers the stamped shell over the one the parent chain leads to", async () => {
		const bindings = await SessionBinder.bind({
			shells: [
				{ sessionId: "session-a", shellId: "shell-a", pid: 100 },
				{ sessionId: "session-b", shellId: "shell-b", pid: 101 },
			],
			agents: [200],
			parentOf: chain([[200, 101]]),
			reader: readerOf({ 200: environ({ [SHELL_ID_ENV]: "shell-a" }) }),
		});

		expect(bindings).toEqual(new Map([["session-a", 200]]));
	});

	test("binds an agent sitting further down the shell's tree", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: 100 }],
			agents: [300],
			parentOf: chain([[300, 250], [250, 100]]),
			reader: unstamped,
		});
		expect(bindings.get("session-a")).toBe(300);
	});

	test("does not bind a shell with no agent under it, nor an agent outside every shell", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "empty", shellId: "shell-empty", pid: 100 }],
			agents: [300],
			parentOf: chain([[300, 900], [900, 1]]),
			reader: unstamped,
		});
		expect(bindings.size).toBe(0);
	});

	test("prefers the agent nearest the shell over one nested below it", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: 100 }],
			agents: [400, 200],
			parentOf: chain([[200, 100], [400, 300], [300, 200]]),
			reader: unstamped,
		});
		expect(bindings.get("session-a")).toBe(200);
	});

	test("gives each shell the agent under it", async () => {
		const bindings = await SessionBinder.bind({
			shells: [
				{ sessionId: "session-a", shellId: "shell-a", pid: 100 },
				{ sessionId: "session-b", shellId: "shell-b", pid: 101 },
			],
			agents: [200, 201],
			parentOf: chain([[200, 100], [201, 101]]),
			reader: unstamped,
		});
		expect(bindings).toEqual(new Map([["session-a", 200], ["session-b", 201]]));
	});

	test("stops walking a parent chain that cycles back on itself", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: 100 }],
			agents: [200],
			parentOf: chain([[200, 250], [250, 200]]),
			reader: unstamped,
		});
		expect(bindings.size).toBe(0);
	});

	test("stops at init rather than binding pid 1", async () => {
		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "init", shellId: "shell-init", pid: 1 }],
			agents: [200],
			parentOf: chain([[200, 1]]),
			reader: unstamped,
		});
		expect(bindings.size).toBe(0);
	});
});

describe.if(process.platform === "linux")("binding against real processes", () => {
	async function execed(pid: number, binary: string): Promise<boolean> {
		const exe = await readlink(`/proc/${pid}/exe`).catch(() => null);

		return exe !== null && basename(exe) === binary;
	}

	test("walks up from a live pid to the process that spawned it", async () => {
		const parent = await ProcFs.parent(process.pid);
		if (parent === null) {
			throw new Error("this test process has no parent to bind to");
		}

		const bindings = await SessionBinder.bind({
			shells: [{ sessionId: "session-a", shellId: "shell-a", pid: parent }],
			agents: [process.pid],
			parentOf: ProcFs.parent,
		});
		expect(bindings).toEqual(new Map([["session-a", process.pid]]));
	});

	test("reports no parent for a pid that does not exist", async () => {
		expect(await ProcFs.parent(0x7f_ff_ff_ff)).toBeNull();
	});

	test("binds a harness the shell orphaned, by its stamped environment", async () => {
		const shellId = `shell-${process.pid}`;
		const binary = "sleep";
		const orphan = Bun.spawn(["sh", "-c", `exec ${binary} 30`], {
			env: { ...process.env, [SHELL_ID_ENV]: shellId },
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		try {
			while (!(await execed(orphan.pid, binary)) || (await ShellAgents.shellOf(orphan.pid)) !== shellId) {
				await Bun.sleep(5);
			}

			const bindings = await SessionBinder.bind({
				shells: [{ sessionId: "pane", shellId, pid: 1 }],
				agents: [orphan.pid],
				parentOf: () => Promise.resolve(null),
			});
			expect(bindings).toEqual(new Map([["pane", orphan.pid]]));
		} finally {
			orphan.kill("SIGKILL");
			await orphan.exited;
		}
	});

	test("binds a harness launched the way a pane launches it", async () => {
		const shell = "/bin/sh";
		const pane = Bun.spawn([shell, ...ShellCommandLine.shellArgs(shell, "sleep 30")], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		try {
			await Bun.sleep(300);
			const listed = await new Response(Bun.spawn(["pgrep", "-P", String(pane.pid)]).stdout).text();
			const harness = Number(listed.trim().split("\n")[0]);
			expect(harness).toBeGreaterThan(0);

			const bindings = await SessionBinder.bind({
				shells: [{ sessionId: "pane", shellId: "shell-pane", pid: pane.pid }],
				agents: [harness],
				parentOf: ProcFs.parent,
			});
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
			cwd: "/home/jui/projects/bankai",
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

		expect(presences.flatMap((presence) => presence.sessionId ?? []).sort()).toEqual([
			"5daa2868-d467-4a46-b335-cd6405f22327",
			"67af1e51-358c-475f-b33a-7de1e199d0a5",
		]);
	});

	test("yields nothing when the registry directory is absent", async () => {
		process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "claude-config-missing-xyz");
		expect(await ClaudeHarness.discover()).toEqual([]);
	});

	test("declares the registry directory as the file to watch", () => {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		process.env.CLAUDE_CONFIG_DIR = configDir;

		expect(Harnesses.watchPaths()).toContain(join(configDir, "sessions"));
	});

	test("watches the native transcript that publishes the session name", async () => {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		const sessions = join(configDir, "sessions");
		mkdirSync(sessions);
		writeFileSync(join(sessions, "141653.json"), BUSY_RECORD);
		process.env.CLAUDE_CONFIG_DIR = configDir;
		await ClaudeHarness.discover();

		expect(Harnesses.watchPaths()).toContain(
			join(configDir, "projects", "-home-jui-projects-bankai", "67af1e51-358c-475f-b33a-7de1e199d0a5.jsonl"),
		);
	});
});

describe("how long the card has held its state", () => {
	test("a state that did not change keeps the clock it was already showing", () => {
		expect(ShellActivity.clockSince({ previous: "working", next: "working", held: 1000, reported: 5000 })).toBe(1000);
	});

	test("a busy agent dropping into a shell does not restart the clock", () => {
		expect(ShellActivity.clockSince({ previous: "working", next: "working", held: 1000, reported: 9000 })).toBe(1000);
	});

	test("a state that changed adopts the moment the harness reported", () => {
		expect(ShellActivity.clockSince({ previous: "working", next: "done", held: 1000, reported: 9000 })).toBe(9000);
	});

	test("a shell seen for the first time takes the harness clock", () => {
		expect(ShellActivity.clockSince({ previous: undefined, next: "working", held: undefined, reported: 9000 })).toBe(9000);
	});

	test("a harness with no clock leaves the card without one", () => {
		expect(ShellActivity.clockSince({ previous: undefined, next: "working", held: undefined, reported: undefined })).toBeUndefined();
	});
});
