import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { claudeRead, spoolReading } from "@main/activity/claudeSpool";
import { CLAUDE_HARNESS_ID } from "@main/activity/harnessIds";
import { hookSpoolDir, SPOOL_SEPARATOR, spoolPath } from "@main/activity/HookSource";

const SESSION = "0199e7f9-8b1e-7c22-9f4a-5b2d0d9a1c33";

const TURN_START = 1_800_000_000_000;

function tail(records: [number, object][]): string {
	return records.map(([at, event]) => `${at} ${JSON.stringify(event)}${SPOOL_SEPARATOR}`).join("");
}

describe("reading what the claude hook spooled", () => {
	test("the turn ended when the newest Stop ran", () => {
		const reading = spoolReading(tail([
			[TURN_START, { hook_event_name: "Stop" }],
			[TURN_START + 9000, { hook_event_name: "Stop" }],
		]));

		expect(reading.endedAt).toBe(TURN_START + 9000);
	});

	test("a notification carrying a message is what the wait is about", () => {
		const reading = spoolReading(tail([
			[TURN_START, { hook_event_name: "Notification", message: "Claude needs your permission to use Bash" }],
		]));

		expect(reading.attention).toEqual({ message: "Claude needs your permission to use Bash", at: TURN_START });
	});

	test("the newest notification wins over the one before it", () => {
		const reading = spoolReading(tail([
			[TURN_START, { hook_event_name: "Notification", message: "Waiting for your input" }],
			[TURN_START + 40, { hook_event_name: "Notification", message: "Claude needs your permission to use Bash" }],
		]));

		expect(reading.attention?.message).toBe("Claude needs your permission to use Bash");
	});

	test("a notification with nothing to say labels nothing", () => {
		expect(spoolReading(tail([[TURN_START, { hook_event_name: "Notification" }]])).attention).toBeUndefined();
	});

	test("an event this version does not read leaves the reading empty", () => {
		expect(spoolReading(tail([[TURN_START, { hook_event_name: "PreToolUse", tool_name: "Bash" }]]))).toEqual({});
	});

	test("a record that is not a stamped event is skipped, and the rest still reads", () => {
		const reading = spoolReading(
			`no-stamp${SPOOL_SEPARATOR}0 {}${SPOOL_SEPARATOR}${TURN_START} { not json${SPOOL_SEPARATOR}` +
				`${TURN_START} {"hook":"Stop"}${SPOOL_SEPARATOR}` +
				tail([[TURN_START + 10, { hook_event_name: "Stop" }]]),
		);

		expect(reading).toEqual({ endedAt: TURN_START + 10 });
	});

	test("an empty spool reports nothing at all", () => {
		expect(spoolReading("")).toEqual({});
	});
});

describe("the spool a live session reads from", () => {
	test("carries both facts of the file the hook appends to", async () => {
		mkdirSync(hookSpoolDir(), { recursive: true });
		writeFileSync(
			spoolPath({ harness: CLAUDE_HARNESS_ID, sessionId: SESSION }),
			tail([
				[TURN_START, { hook_event_name: "Notification", message: "Claude needs your permission to use Bash" }],
				[TURN_START + 9000, { hook_event_name: "Stop" }],
			]),
		);

		expect(await claudeRead({ sessionId: SESSION })).toEqual({
			endedAt: TURN_START + 9000,
			attention: { message: "Claude needs your permission to use Bash", at: TURN_START },
		});
	});

	test("a session whose hook never ran reports nothing", async () => {
		expect(await claudeRead({ sessionId: SESSION })).toEqual({});
	});
});
