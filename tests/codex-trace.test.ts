import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { codexRead, codexSpoolReading, codexSpoolRecord, codexToolTrace } from "@main/activity/codexHookTrace";
import { CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import { hookSpoolDir, SPOOL_SEPARATOR, spoolPath } from "@main/activity/HookSource";
import {
	DELEGATING_TRACE,
	EDITING_TRACE,
	EXPLORING_TRACE,
	PLANNING_TRACE,
	RUNNING_TRACE,
	THINKING_TRACE,
} from "@main/activity/traceLabels";

const SESSION = "019fb42f-6131-7b33-aca6-154f86ed4f64";

const REF = { harness: CODEX_HARNESS_ID, sessionId: SESSION };

const AT = 1784901075701;

function record(at: number, payload: Record<string, unknown>): string {
	return `${at} ${JSON.stringify({ session_id: SESSION, ...payload })}${SPOOL_SEPARATOR}`;
}

function writeSpool(records: string[]): void {
	mkdirSync(hookSpoolDir(), { recursive: true });
	writeFileSync(spoolPath(REF), records.join(""));
}

describe("reading one spooled codex event", () => {
	test("keeps the moment the hook ran and the event it carried", () => {
		const parsed = codexSpoolRecord(`${AT} {"session_id":"${SESSION}","hook_event_name":"Stop"}`);

		expect(parsed?.at).toBe(AT);
		expect(parsed?.event.hook_event_name).toBe("Stop");
	});

	test("refuses a record with no stamp, no payload, or no event name", () => {
		expect(codexSpoolRecord('{"hook_event_name":"Stop"}')).toBeNull();
		expect(codexSpoolRecord(`${AT} { not json`)).toBeNull();
		expect(codexSpoolRecord(`${AT} {"session_id":"x"}`)).toBeNull();
		expect(codexSpoolRecord(`0 {"hook_event_name":"Stop"}`)).toBeNull();
	});
});

describe("naming what a codex tool is doing", () => {
	test("uses codex's own tool vocabulary, not another harness's", () => {
		expect(codexToolTrace("apply_patch")).toBe(EDITING_TRACE);
		expect(codexToolTrace("exec_command")).toBe(RUNNING_TRACE);
		expect(codexToolTrace("read_file")).toBe(EXPLORING_TRACE);
		expect(codexToolTrace("spawn_agent")).toBe(DELEGATING_TRACE);
		expect(codexToolTrace("update_plan")).toBe(PLANNING_TRACE);
	});

	test("names the two tools a real codex turn was measured using", () => {
		expect(codexToolTrace("apply_patch")).toBe(EDITING_TRACE);
		expect(codexToolTrace("Bash")).toBe(RUNNING_TRACE);
	});

	test("says nothing about a tool it has never seen", () => {
		expect(codexToolTrace("some_new_tool")).toBeNull();
	});
});

describe("reading the tail of the codex spool", () => {
	test("a submitted prompt reads as thinking", () => {
		const reading = codexSpoolReading(record(AT, { hook_event_name: "UserPromptSubmit" }));

		expect(reading?.trace?.label).toBe(THINKING_TRACE);
		expect(reading?.trace?.since).toBe(AT);
	});

	test("an opened tool names itself and carries the turn it belongs to", () => {
		const reading = codexSpoolReading(
			record(AT, { hook_event_name: "PreToolUse", tool_name: "apply_patch", turn_id: "turn-1" }),
		);

		expect(reading?.trace).toEqual({ label: EDITING_TRACE, recordId: "turn-1", since: AT });
	});

	test("a finished tool goes back to thinking rather than holding the last tool", () => {
		const reading = codexSpoolReading(
			[
				record(AT, { hook_event_name: "PreToolUse", tool_name: "apply_patch" }),
				record(AT + 10, { hook_event_name: "PostToolUse", tool_name: "apply_patch" }),
			].join(""),
		);

		expect(reading?.trace?.label).toBe(THINKING_TRACE);
	});

	test("the end of a turn clears the trace and dates the end", () => {
		const reading = codexSpoolReading(
			[record(AT, { hook_event_name: "UserPromptSubmit" }), record(AT + 10, { hook_event_name: "Stop" })].join(""),
		);

		expect(reading).toEqual({ at: AT + 10, trace: null, over: true });
	});

	test("an unnamed tool holds the turn open with no label of its own", () => {
		const reading = codexSpoolReading(
			[
				record(AT, { hook_event_name: "UserPromptSubmit" }),
				record(AT + 10, { hook_event_name: "PreToolUse", tool_name: "some_new_tool" }),
			].join(""),
		);

		expect(reading).toEqual({ at: AT + 10, trace: null, over: false });
	});

	test("an event that names nothing falls through to the one before it", () => {
		const reading = codexSpoolReading(
			[record(AT, { hook_event_name: "UserPromptSubmit" }), record(AT + 10, { hook_event_name: "PreToolUse" })].join(
				"",
			),
		);

		expect(reading?.trace?.label).toBe(THINKING_TRACE);
	});

	test("reads nothing out of a spool of malformed records", () => {
		expect(codexSpoolReading(`garbage${SPOOL_SEPARATOR}more garbage`)).toBeNull();
	});
});

describe("what the harness reports from the spool", () => {
	test("names the running tool", async () => {
		writeSpool([record(AT, { hook_event_name: "PreToolUse", tool_name: "exec", turn_id: "turn-1" })]);

		expect(await codexRead({ sessionId: SESSION })).toEqual({
			trace: { label: RUNNING_TRACE, recordId: "turn-1", since: AT },
		});
	});

	test("reports the end of a turn with the moment it ended", async () => {
		writeSpool([record(AT, { hook_event_name: "Stop" })]);

		expect(await codexRead({ sessionId: SESSION })).toEqual({ trace: null, endedAt: AT });
	});

	test("an unnamed tool costs the label without ending the turn", async () => {
		writeSpool([record(AT, { hook_event_name: "PreToolUse", tool_name: "some_new_tool" })]);

		expect(await codexRead({ sessionId: SESSION })).toEqual({ trace: null });
	});

	test("costs the label and nothing else when the hook never ran", async () => {
		rmSync(spoolPath(REF), { force: true });

		expect(await codexRead({ sessionId: SESSION })).toEqual({ trace: null });
	});
});
