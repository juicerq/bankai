import { mkdirSync, watch, writeFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";
import { readSpool, spoolEvent, spoolReading } from "@main/activity/claudeHookTrace";
import { CLAUDE_HARNESS_ID } from "@main/activity/harnessIds";
import { fresherReading } from "@main/activity/claudeTraceSource";
import { recordTrace } from "@main/activity/claudeTrace";
import { hookSpoolDir, SPOOL_SEPARATOR, spoolPath } from "@main/activity/HookSource";

const SESSION = "0199e7f9-8b1e-7c22-9f4a-5b2d0d9a1c33";

const REF = { harness: CLAUDE_HARNESS_ID, sessionId: SESSION };

function record(at: number, payload: Record<string, unknown>): string {
	return `${at} ${JSON.stringify({ session_id: SESSION, ...payload })}${SPOOL_SEPARATOR}`;
}

function writeSpool(records: string[]): void {
	mkdirSync(hookSpoolDir(), { recursive: true });
	writeFileSync(spoolPath(REF), records.join(""));
}

describe("reading one spooled event", () => {
	test("names the tool exactly as the transcript does", () => {
		const input = { file_path: "/home/jui/projects/bankai-2/src/main/index.ts" };
		const event = spoolEvent(`1784901075701 ${
			JSON.stringify({ session_id: SESSION, hook_event_name: "PreToolUse", tool_name: "Read", tool_input: input })
		}`);
		const transcript = recordTrace(JSON.stringify({
			type: "assistant",
			uuid: "abc",
			timestamp: "2026-07-27T10:00:00.000Z",
			message: { content: [{ type: "tool_use", name: "Read", input }] },
		}));

		expect(event?.trace?.label).toBe(transcript?.label ?? "");
		expect(event?.trace?.label).toBe("Reading index.ts");
	});

	test("counts from the moment the event happened", () => {
		const event = spoolEvent(record(1784901075701, { hook_event_name: "PreToolUse", tool_name: "Bash" }).slice(0, -1));

		expect(event?.at).toBe(1784901075701);
		expect(event?.trace?.since).toBe(1784901075701);
	});

	test("reads a prompt and a finished tool as thinking", () => {
		for (const name of ["UserPromptSubmit", "PostToolUse"]) {
			const event = spoolEvent(record(1784901075701, { hook_event_name: name }).slice(0, -1));

			expect(event?.trace?.label).toBe("Thinking");
		}
	});

	test("reads the end of a turn as no label at all", () => {
		const event = spoolEvent(record(1784901075701, { hook_event_name: "Stop" }).slice(0, -1));

		expect(event).toEqual({ at: 1784901075701, trace: null });
	});

	test("skips a truncated or malformed record", () => {
		expect(spoolEvent('1784901075701 {"session_id":"abc"')).toBeNull();
		expect(spoolEvent('{"hook_event_name":"Stop"}')).toBeNull();
		expect(spoolEvent("")).toBeNull();
	});

	test("identifies the event by the tool call, or by its own moment", () => {
		const call = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "toolu_1" };

		expect(spoolEvent(record(1784901075701, call).slice(0, -1))?.trace?.recordId).toBe("toolu_1");
		expect(spoolEvent(record(1784901075701, { hook_event_name: "PostToolUse" }).slice(0, -1))?.trace?.recordId)
			.toBe("1784901075701");
	});
});

describe("reading the spool of a session", () => {
	test("takes the newest complete record and ignores the half-written one", async () => {
		writeSpool([
			record(1784901075000, { hook_event_name: "PreToolUse", tool_name: "Bash" }),
			record(1784901075701, { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "a.ts" } }),
			'1784901075999 {"session_id":"0199',
		]);

		expect((await readSpool({ sessionId: SESSION })).event?.trace?.label).toBe("Reading a.ts");
	});

	test("is not an error for a session that never wrote one", async () => {
		mkdirSync(hookSpoolDir(), { recursive: true });

		expect(await readSpool({ sessionId: "never-ran" })).toEqual({ event: null, attention: null });
	});
});

describe("what the agent is asking for", () => {
	const NOTIFICATION = {
		hook_event_name: "Notification",
		message: "Claude needs your permission to use Bash",
	};

	test("the notification labels the wait and the tool it opened on details it", () => {
		const reading = spoolReading([
			record(1784901075000, { hook_event_name: "UserPromptSubmit" }),
			record(1784901075500, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "rm -rf out" } }),
			record(1784901075701, NOTIFICATION),
		].join(""));

		expect(reading.attention).toEqual({
			message: "Claude needs your permission to use Bash",
			at: 1784901075701,
			detail: "rm -rf out",
		});
	});

	test("a tool that already finished does not describe the open dialog", () => {
		const reading = spoolReading([
			record(1784901075500, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } }),
			record(1784901075600, { hook_event_name: "PostToolUse", tool_name: "Bash" }),
			record(1784901075701, NOTIFICATION),
		].join(""));

		expect(reading.attention).toEqual({ message: NOTIFICATION.message, at: 1784901075701 });
	});

	test("the freshest notification wins over the one before it", () => {
		const reading = spoolReading([
			record(1784901075000, { hook_event_name: "Notification", message: "Claude is waiting for your input" }),
			record(1784901075701, NOTIFICATION),
		].join(""));

		expect(reading.attention?.message).toBe(NOTIFICATION.message);
	});

	test("a spool with no notification leaves the card unlabelled", () => {
		const reading = spoolReading(record(1784901075701, { hook_event_name: "PreToolUse", tool_name: "Bash" }));

		expect(reading.attention).toBeNull();
	});

	test("a notification never becomes the trace of what the agent is doing", () => {
		const reading = spoolReading([
			record(1784901075000, { hook_event_name: "PreToolUse", tool_name: "Bash" }),
			record(1784901075701, NOTIFICATION),
		].join(""));

		expect(reading.event?.trace?.label).toBe("Running commands");
	});
});

describe("choosing between the event and the transcript", () => {
	const transcript = { label: "Running commands", recordId: "uuid", since: 1784901075000 };

	test("the event wins while it is the fresher of the two", () => {
		const event = { at: 1784901075701, trace: { label: "Reading a.ts", recordId: "toolu_1", since: 1784901075701 } };

		expect(fresherReading({ event, attention: null }, transcript)).toEqual({ trace: event.trace });
	});

	test("a stale spool loses to the transcript", () => {
		const event = { at: 1784900000000, trace: { label: "Thinking", recordId: "x", since: 1784900000000 } };

		expect(fresherReading({ event, attention: null }, transcript)).toEqual({ trace: transcript });
	});

	test("a session with no spool keeps the transcript", () => {
		expect(fresherReading({ event: null, attention: null }, transcript)).toEqual({ trace: transcript });
	});

	test("the end of a turn silences the trace and dates the end", () => {
		expect(fresherReading({ event: { at: 1784901075701, trace: null }, attention: null }, transcript))
			.toEqual({ trace: null, endedAt: 1784901075701 });
	});

	test("what the agent is asking rides beside whichever trace won", () => {
		const attention = { message: "Claude needs your permission to use Bash", at: 1784901075701 };

		expect(fresherReading({ event: null, attention }, transcript)).toEqual({ trace: transcript, attention });
	});
});

describe("watching the spool directory", () => {
	test("an append to a file created after the watch started wakes the watcher", async () => {
		mkdirSync(hookSpoolDir(), { recursive: true });
		const fired = Promise.withResolvers<void>();
		const watcher = watch(hookSpoolDir(), () => fired.resolve());

		try {
			await appendFile(spoolPath(REF), record(1784901075701, { hook_event_name: "Stop" }));
			await fired.promise;
		} finally {
			watcher.close();
		}
	});
});
