import { open } from "node:fs/promises";
import { type } from "arktype";
import type { HarnessTrace } from "@main/activity/Harness";
import { SPOOL_SEPARATOR } from "@main/activity/claudeHooks";
import { spoolPath } from "@main/activity/HookSource";
import { THINKING_TRACE, toolTrace } from "@main/activity/claudeTrace";
import { Logger } from "@main/logger";

const SPOOL_TAIL_BYTES = 16 * 1024;

const TURN_OVER = "Stop";

const THINKING_EVENTS = new Set(["UserPromptSubmit", "PostToolUse"]);

const hookEventSchema = type({
	hook_event_name: "string",
	"tool_name?": "string",
	"tool_input?": "Record<string, unknown>",
	"tool_use_id?": "string",
});

export interface SpoolEvent {
	at: number;
	trace: HarnessTrace | null;
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

export function spoolEvent(raw: string): SpoolEvent | null {
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

	const trace = eventTrace(event, at);
	if (trace === undefined) {
		return null;
	}

	return { at, trace };
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

export async function spoolTrace(ref: { sessionId: string }): Promise<SpoolEvent | null> {
	const tail = await readTail(spoolPath(ref.sessionId));
	if (tail === null) {
		return null;
	}

	for (const record of tail.split(SPOOL_SEPARATOR).reverse()) {
		const event = spoolEvent(record);
		if (event) {
			return event;
		}
	}

	return null;
}

function missingFile(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT";
}
