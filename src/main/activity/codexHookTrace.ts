import type { HarnessReading, HarnessTrace } from "@main/activity/Harness";
import { readSpoolTail, SPOOL_SEPARATOR, spoolPath } from "@main/activity/HookSource";
import { CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import {
	DELEGATING_TRACE,
	EDITING_TRACE,
	EXPLORING_TRACE,
	PLANNING_TRACE,
	RUNNING_TRACE,
	THINKING_TRACE,
} from "@main/activity/traceLabels";
import { type } from "arktype";

const TURN_OVER = "Stop";

const THINKING_EVENTS = new Set(["UserPromptSubmit", "PostToolUse"]);

const TOOL_OPENED = "PreToolUse";

const CODEX_TOOL_TRACE: Record<string, string> = {
	apply_patch: EDITING_TRACE,
	exec: RUNNING_TRACE,
	exec_command: RUNNING_TRACE,
	followup_task: DELEGATING_TRACE,
	interrupt_agent: DELEGATING_TRACE,
	list_agents: DELEGATING_TRACE,
	read_file: EXPLORING_TRACE,
	run: RUNNING_TRACE,
	send_message: DELEGATING_TRACE,
	spawn_agent: DELEGATING_TRACE,
	update_plan: PLANNING_TRACE,
	wait: DELEGATING_TRACE,
	wait_agent: DELEGATING_TRACE,
	write_stdin: RUNNING_TRACE,
};

export function codexToolTrace(name: string): string {
	return CODEX_TOOL_TRACE[name.toLowerCase()] ?? RUNNING_TRACE;
}

const codexHookEventSchema = type({
	hook_event_name: "string",
	"tool_name?": "string",
	"turn_id?": "string",
});

interface CodexSpoolRecord {
	at: number;
	event: typeof codexHookEventSchema.infer;
}

export function codexSpoolRecord(raw: string): CodexSpoolRecord | null {
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

	const event = codexHookEventSchema(value);
	if (event instanceof type.errors) {
		return null;
	}

	return { at, event };
}

function eventTrace(event: typeof codexHookEventSchema.infer, at: number): HarnessTrace | null | undefined {
	if (event.hook_event_name === TURN_OVER) {
		return null;
	}
	if (THINKING_EVENTS.has(event.hook_event_name)) {
		return { label: THINKING_TRACE, recordId: String(at), since: at };
	}
	if (event.hook_event_name !== TOOL_OPENED || !event.tool_name) {
		return undefined;
	}

	return {
		label: codexToolTrace(event.tool_name),
		recordId: event.turn_id ?? String(at),
		since: at,
	};
}

export function codexSpoolReading(tail: string): { at: number; trace: HarnessTrace | null } | null {
	for (const raw of tail.split(SPOOL_SEPARATOR).reverse()) {
		const record = codexSpoolRecord(raw);
		if (!record) {
			continue;
		}

		const trace = eventTrace(record.event, record.at);
		if (trace !== undefined) {
			return { at: record.at, trace };
		}
	}

	return null;
}

export async function codexRead(ref: { sessionId: string }): Promise<HarnessReading> {
	const tail = await readSpoolTail(spoolPath({ harness: CODEX_HARNESS_ID, sessionId: ref.sessionId }));
	if (tail === null) {
		return { trace: null };
	}

	const reading = codexSpoolReading(tail);
	if (!reading) {
		return { trace: null };
	}
	if (reading.trace) {
		return { trace: reading.trace };
	}

	return { trace: null, endedAt: reading.at };
}
