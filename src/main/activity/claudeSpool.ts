import { type } from "arktype";
import type { HarnessReading } from "@main/activity/Harness";
import { CLAUDE_HARNESS_ID } from "@main/activity/harnessIds";
import { readSpoolTail, SPOOL_SEPARATOR, spoolPath } from "@main/activity/HookSource";
import type { ShellAttention } from "@shared/activity";

const TURN_OVER = "Stop";

const ATTENTION_OPENED = "Notification";

const hookEventSchema = type({
	hook_event_name: "string",
	"message?": "string",
});

interface SpoolRecord {
	at: number;
	event: typeof hookEventSchema.infer;
}

function spoolRecord(raw: string): SpoolRecord | null {
	const split = raw.indexOf(" ");
	if (split < 1) {
		return null;
	}

	const at = Number(raw.slice(0, split));
	if (!Number.isFinite(at) || at <= 0) {
		return null;
	}

	let value: unknown;
	try {
		value = JSON.parse(raw.slice(split + 1));
	} catch {
		return null;
	}

	const event = hookEventSchema(value);
	if (event instanceof type.errors) {
		return null;
	}

	return { at, event };
}

export function spoolReading(tail: string): HarnessReading {
	let endedAt: number | undefined;
	let attention: ShellAttention | undefined;

	for (const raw of tail.split(SPOOL_SEPARATOR).reverse()) {
		const record = spoolRecord(raw);
		if (!record) {
			continue;
		}
		if (endedAt === undefined && record.event.hook_event_name === TURN_OVER) {
			endedAt = record.at;
		}
		if (!attention && record.event.hook_event_name === ATTENTION_OPENED && record.event.message) {
			attention = { message: record.event.message, at: record.at };
		}
		if (endedAt !== undefined && attention) {
			break;
		}
	}

	return { ...(endedAt !== undefined && { endedAt }), ...(attention && { attention }) };
}

export async function claudeRead(ref: { sessionId: string }): Promise<HarnessReading> {
	const tail = await readSpoolTail(spoolPath({ harness: CLAUDE_HARNESS_ID, sessionId: ref.sessionId }));
	if (tail === null) {
		return {};
	}

	return spoolReading(tail);
}
