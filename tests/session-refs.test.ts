import { describe, expect, test } from "bun:test";
import { parseSessionRecord } from "@main/activity/claude";
import { reconcileSessionRefs, type SessionRef } from "@main/activity/SessionRefs";
import { assertDefined } from "./utils/assertions";

const BUSY_RECORD =
	'{"pid":141653,"sessionId":"67af1e51-358c-475f-b33a-7de1e199d0a5","cwd":"/home/jui/projects/bankai","startedAt":1784894292497,"procStart":"215800","version":"2.1.218","kind":"interactive","status":"busy","updatedAt":1784901075701}';
const IDLE_RECORD =
	'{"pid":336333,"sessionId":"5daa2868-d467-4a46-b335-cd6405f22327","cwd":"/home/jui/dogama/app","startedAt":1784896966459,"procStart":"483184","version":"2.1.218","kind":"interactive","status":"idle","updatedAt":1784901169072}';

function refFrom(record: string): SessionRef {
	const presence = parseSessionRecord(record);
	assertDefined(presence);
	assertDefined(presence.sessionId);
	return { harness: presence.harness, sessionId: presence.sessionId, cwd: presence.cwd };
}

const BUSY_REF = refFrom(BUSY_RECORD);
const IDLE_REF = refFrom(IDLE_RECORD);

describe("reconcileSessionRefs", () => {
	test("captures a new live binding as an upsert and remembers it", () => {
		const { changes, next } = reconcileSessionRefs(new Map(), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: BUSY_REF },
		]);

		expect(changes).toEqual([{ kind: "upsert", projectId: "p1", shellId: "shell-a", session: BUSY_REF }]);
		expect(next.get("shell-a")).toEqual(BUSY_REF);
	});

	test("emits no change when the same session ref is still bound across ticks", () => {
		const { changes, next } = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: { ...BUSY_REF } },
		]);

		expect(changes).toEqual([]);
		expect(next.get("shell-a")).toEqual(BUSY_REF);
	});

	test("upserts when the bound native session id changes", () => {
		const { changes } = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: IDLE_REF },
		]);

		expect(changes).toEqual([{ kind: "upsert", projectId: "p1", shellId: "shell-a", session: IDLE_REF }]);
	});

	test("captures the directory the agent runs in, not the shell's project root", () => {
		const { changes } = reconcileSessionRefs(new Map(), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: BUSY_REF },
		]);

		expect(changes[0]).toMatchObject({ session: { cwd: "/home/jui/projects/bankai" } });
	});

	test("upserts when the same agent is observed from a different directory", () => {
		const { changes } = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: { ...BUSY_REF, cwd: "/home/jui/projects/bankai/src" } },
		]);

		expect(changes).toHaveLength(1);
	});

	test("clears a remembered ref when the shell returns to its prompt", () => {
		const { changes, next } = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), [
			{ shellId: "shell-a", projectId: "p1", agentBound: false, session: undefined },
		]);

		expect(changes).toEqual([{ kind: "clear", projectId: "p1", shellId: "shell-a" }]);
		expect(next.has("shell-a")).toBe(false);
	});

	test("leaves an unbound shell untouched when nothing was remembered", () => {
		const { changes } = reconcileSessionRefs(new Map(), [
			{ shellId: "shell-a", projectId: "p1", agentBound: false, session: undefined },
		]);

		expect(changes).toEqual([]);
	});

	test("captures a duplicated session ref on every remembered shell", () => {
		const { changes, next } = reconcileSessionRefs(new Map(), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: BUSY_REF },
			{ shellId: "shell-b", projectId: "p1", agentBound: true, session: BUSY_REF },
		]);

		expect(changes).toEqual([
			{ kind: "upsert", projectId: "p1", shellId: "shell-a", session: BUSY_REF },
			{ kind: "upsert", projectId: "p1", shellId: "shell-b", session: BUSY_REF },
		]);
		expect(next.get("shell-a")).toEqual(BUSY_REF);
		expect(next.get("shell-b")).toEqual(BUSY_REF);
	});

	test("forgets shells that disappeared without emitting a clear", () => {
		const { changes, next } = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), []);

		expect(changes).toEqual([]);
		expect(next.size).toBe(0);
	});

	test("keeps the latest resumable session while a bound agent has no readable session id", () => {
		const { changes, next } = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: undefined },
		]);

		expect(changes).toEqual([]);
		expect(next.get("shell-a")).toEqual(BUSY_REF);
	});

	test("replaces a previous Claude ref when Codex publishes its resumable session", () => {
		const codex = { harness: "codex", sessionId: "019c0000-0000-7000-8000-000000000000", cwd: BUSY_REF.cwd };
		const hidden = reconcileSessionRefs(new Map([["shell-a", BUSY_REF]]), [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: undefined },
		]);
		const visible = reconcileSessionRefs(hidden.next, [
			{ shellId: "shell-a", projectId: "p1", agentBound: true, session: codex },
		]);

		expect(visible.changes).toEqual([{ kind: "upsert", projectId: "p1", shellId: "shell-a", session: codex }]);
		expect(visible.next.get("shell-a")).toEqual(codex);
	});
});
