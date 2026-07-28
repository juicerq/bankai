import { open } from "node:fs/promises";
import { type } from "arktype";
import type { HarnessTrace } from "@main/activity/Harness";
import { SPOOL_SEPARATOR } from "@main/activity/claudeHooks";
import { spoolPath } from "@main/activity/HookSource";
import { THINKING_TRACE, toolTrace } from "@main/activity/claudeTrace";
import { Logger } from "@main/logger";
import type { ShellAttention } from "@shared/activity";

const SPOOL_TAIL_BYTES = 16 * 1024;

const TURN_OVER = "Stop";

const THINKING_EVENTS = new Set(["UserPromptSubmit", "PostToolUse"]);

const TOOL_OPENED = "PreToolUse";

const TOOL_EVENTS = new Set([TOOL_OPENED, "PostToolUse"]);

const ATTENTION_OPENED = "Notification";

const hookEventSchema = type({
	hook_event_name: "string",
	"tool_name?": "string",
	"tool_input?": "Record<string, unknown>",
	"tool_use_id?": "string",
	"message?": "string",
});

export interface SpoolEvent {
	at: number;
	trace: HarnessTrace | null;
}

export interface SpoolReading {
	event: SpoolEvent | null;
	attention: ShellAttention | null;
}

function eventTrace(
	event: typeof hookEventSchema.infer,
	at: number,
): HarnessTrace | null | undefined {
	if (event.hook_event_name === TURN_OVER) {
		return null;
	}
	if (THINKING_EVENTS.has(event.hook_event_name)) {
		return { label: THINKING_TRACE, recordId: String(at), since: at };
	}
	if (!event.tool_name) {
		return undefined;
	}

	return {
		label: toolTrace(event.tool_name, event.tool_input),
		recordId: event.tool_use_id ?? String(at),
		since: at,
	};
}

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

export function spoolEvent(raw: string): SpoolEvent | null {
	const record = spoolRecord(raw);
	if (!record) {
		return null;
	}

	const trace = eventTrace(record.event, record.at);
	if (trace === undefined) {
		return null;
	}

	return { at: record.at, trace };
}

export function spoolReading(tail: string): SpoolReading {
	let event: SpoolEvent | null = null;
	let notified: { message: string; at: number } | undefined;
	let detail: string | undefined;
	let toolSettled = false;

	for (const raw of tail.split(SPOOL_SEPARATOR).reverse()) {
		const record = spoolRecord(raw);
		if (!record) {
			continue;
		}

		if (!toolSettled && TOOL_EVENTS.has(record.event.hook_event_name)) {
			toolSettled = true;
			if (record.event.hook_event_name === TOOL_OPENED && record.event.tool_name) {
				detail = toolTrace(record.event.tool_name, record.event.tool_input);
			}
		}
		if (!notified && record.event.hook_event_name === ATTENTION_OPENED && record.event.message) {
			notified = { message: record.event.message, at: record.at };
		}
		if (!event) {
			const trace = eventTrace(record.event, record.at);
			if (trace !== undefined) {
				event = { at: record.at, trace };
			}
		}
	}

	if (!notified) {
		return { event, attention: null };
	}

	return { event, attention: { ...notified, ...(detail && { detail }) } };
}

async function readTail(path: string): Promise<string | null> {
	const handle = await open(path, "r").catch((err: unknown) => {
		if (!missingFile(err)) {
			Logger.warn("hook-spool:unreadable", { path, err: String(err) });
		}

		return null;
	});
	if (!handle) {
		return null;
	}

	try {
		const { size } = await handle.stat();
		const length = Math.min(size, SPOOL_TAIL_BYTES);
		const { buffer, bytesRead } = await handle.read({
			buffer: Buffer.alloc(length),
			position: size - length,
		});

		return buffer.toString("utf8", 0, bytesRead);
	} finally {
		await handle.close();
	}
}

export async function readSpool(ref: { sessionId: string }): Promise<SpoolReading> {
	const tail = await readTail(spoolPath(ref.sessionId));
	if (tail === null) {
		return { event: null, attention: null };
	}

	return spoolReading(tail);
}

function missingFile(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT";
}
