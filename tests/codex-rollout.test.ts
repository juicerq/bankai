import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CodexRollout } from "@main/agents/harness/codex/codex-rollout";

const SESSION = "019f898d-719d-7811-9b34-86470df90a52";

const CWD = "/home/jui/projects/bankai";

const OPENED_AT = 1784901075;

const CLOSED_AT = 1784901099;

function metaRecord(payload: Record<string, unknown>): string {
	return `${JSON.stringify({
		timestamp: "2026-07-22T11:22:22.398Z",
		type: "session_meta",
		payload: { session_id: SESSION, cwd: CWD, source: "cli", ...payload },
	})}\n`;
}

function eventRecord(payload: Record<string, unknown>): string {
	return `${JSON.stringify({ timestamp: "2026-07-22T11:22:22.436Z", type: "event_msg", payload })}\n`;
}

const TURN_STARTED = eventRecord({ type: "task_started", turn_id: "turn-1", started_at: OPENED_AT });

const TURN_COMPLETE = eventRecord({ type: "task_complete", completed_at: CLOSED_AT });

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bankai-rollout-"));
});

afterEach(() => {
	CodexRollout.tail.forget(new Set());
	rmSync(dir, { recursive: true, force: true });
});

function rollout(name: string, contents: string): string {
	const path = join(dir, name);
	writeFileSync(path, contents);

	return path;
}

describe("reading a rollout header", () => {
	test("names the session, its directory, and calls a cli thread with no parent a root", () => {
		expect(CodexRollout.meta(metaRecord({}).trim())).toEqual({ sessionId: SESSION, cwd: CWD, root: true });
	});

	test("calls a thread with a parent a subagent, not a root", () => {
		const meta = CodexRollout.meta(metaRecord({ parent_thread_id: "019f0000-0000-7000-8000-000000000000" }).trim());

		expect(meta?.root).toBe(false);
	});

	test("calls a thread from any other source a non-root", () => {
		expect(CodexRollout.meta(metaRecord({ source: "exec" }).trim())?.root).toBe(false);
		expect(CodexRollout.meta(metaRecord({ source: "vscode" }).trim())?.root).toBe(false);
	});

	test("refuses a first record that is not a rollout header", () => {
		expect(CodexRollout.meta('{"type":"event_msg","payload":{"type":"task_started"}}')).toBeNull();
		expect(CodexRollout.meta("not json at all")).toBeNull();
		expect(CodexRollout.meta(JSON.stringify({ type: "session_meta", payload: { cwd: CWD } }))).toBeNull();
	});
});

describe("following the turn edges", () => {
	test("a started task opens a turn dated by the record, not by the clock", () => {
		expect(CodexRollout.turnAfter(CodexRollout.IDLE_ROLLOUT, [TURN_STARTED])).toEqual({
			turn: { turnId: "turn-1", startedAt: OPENED_AT * 1000 },
		});
	});

	test("a completed task closes the turn and dates the end", () => {
		const state = CodexRollout.turnAfter(CodexRollout.IDLE_ROLLOUT, [TURN_STARTED, TURN_COMPLETE]);

		expect(state.turn).toBeNull();
		expect(state.endedAt).toBe(CLOSED_AT * 1000);
	});

	test("an aborted turn closes it too", () => {
		const state = CodexRollout.turnAfter(CodexRollout.IDLE_ROLLOUT, [
			TURN_STARTED,
			eventRecord({ type: "turn_aborted", completed_at: CLOSED_AT }),
		]);

		expect(state.turn).toBeNull();
	});

	test("an unknown event leaves the turn exactly as it was", () => {
		const opened = CodexRollout.turnAfter(CodexRollout.IDLE_ROLLOUT, [TURN_STARTED]);

		expect(CodexRollout.turnAfter(opened, [eventRecord({ type: "agent_reasoning_delta" }), "{ malformed"])).toEqual(opened);
	});

	test("a second start replaces the turn it follows", () => {
		const state = CodexRollout.turnAfter(CodexRollout.turnAfter(CodexRollout.IDLE_ROLLOUT, [TURN_STARTED]), [
			eventRecord({ type: "task_started", turn_id: "turn-2", started_at: CLOSED_AT }),
		]);

		expect(state.turn).toEqual({ turnId: "turn-2", startedAt: CLOSED_AT * 1000 });
	});
});

describe("following a rollout as it grows", () => {
	test("reads only the bytes appended since the last look", async () => {
		const path = rollout("rollout.jsonl", metaRecord({}) + TURN_STARTED);

		expect((await CodexRollout.tail.state(path)).turn?.turnId).toBe("turn-1");

		appendFileSync(path, TURN_COMPLETE);

		expect((await CodexRollout.tail.state(path)).endedAt).toBe(CLOSED_AT * 1000);
	});

	test("holds a record split across two appends until its line is whole", async () => {
		const path = rollout("rollout.jsonl", metaRecord({}));
		await CodexRollout.tail.state(path);

		const half = TURN_STARTED.length - 10;
		appendFileSync(path, TURN_STARTED.slice(0, half));

		expect((await CodexRollout.tail.state(path)).turn).toBeNull();

		appendFileSync(path, TURN_STARTED.slice(half));

		expect((await CodexRollout.tail.state(path)).turn?.turnId).toBe("turn-1");
	});

	test("keeps the last state when the file becomes unreadable", async () => {
		const path = rollout("rollout.jsonl", metaRecord({}) + TURN_STARTED);
		await CodexRollout.tail.state(path);
		rmSync(path);

		expect((await CodexRollout.tail.state(path)).turn?.turnId).toBe("turn-1");
	});

	test("starts over when the file was replaced by a shorter one", async () => {
		const path = rollout("rollout.jsonl", metaRecord({}) + TURN_STARTED + TURN_COMPLETE);
		await CodexRollout.tail.state(path);
		writeFileSync(path, metaRecord({}) + TURN_STARTED);

		expect((await CodexRollout.tail.state(path)).turn?.turnId).toBe("turn-1");
	});

	test("caches a header and forgets it once the rollout is no longer open", async () => {
		const path = rollout("rollout.jsonl", metaRecord({}));

		expect((await CodexRollout.tail.meta(path))?.sessionId).toBe(SESSION);

		rmSync(path);

		expect((await CodexRollout.tail.meta(path))?.sessionId).toBe(SESSION);

		CodexRollout.tail.forget(new Set());

		expect(await CodexRollout.tail.meta(path)).toBeNull();
	});

	test("asks again for a header it could not read at all", async () => {
		const path = join(dir, "later.jsonl");

		expect(await CodexRollout.tail.meta(path)).toBeNull();

		writeFileSync(path, metaRecord({}));

		expect((await CodexRollout.tail.meta(path))?.sessionId).toBe(SESSION);
	});
});

describe("a process holding several rollouts", () => {
	test("names the one root among its subagents", async () => {
		const root = rollout("root.jsonl", metaRecord({}));
		const child = rollout(
			"child.jsonl",
			metaRecord({ session_id: "019f0000-0000-7000-8000-000000000001", parent_thread_id: SESSION }),
		);
		const metas = await Promise.all([root, child].map((path) => CodexRollout.tail.meta(path)));

		expect(metas.filter((meta) => meta?.root)).toHaveLength(1);
	});

	test("leaves two roots unnamed rather than guessing between them", async () => {
		const first = rollout("first.jsonl", metaRecord({}));
		const second = rollout("second.jsonl", metaRecord({ session_id: "019f0000-0000-7000-8000-000000000002" }));
		const metas = await Promise.all([first, second].map((path) => CodexRollout.tail.meta(path)));

		expect(metas.filter((meta) => meta?.root)).toHaveLength(2);
	});
});
