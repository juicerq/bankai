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
	bash: RUNNING_TRACE,
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
	view_image: EXPLORING_TRACE,
	wait: DELEGATING_TRACE,
	wait_agent: DELEGATING_TRACE,
	write_stdin: RUNNING_TRACE,
};

export function codexToolTrace(name: string): string | null {
	return CODEX_TOOL_TRACE[name.toLowerCase()] ?? null;
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

export interface CodexEdge {
	at: number;
	trace: HarnessTrace | null;
	over: boolean;
}

function eventEdge(event: typeof codexHookEventSchema.infer, at: number): CodexEdge | null {
	if (event.hook_event_name === TURN_OVER) {
		return { at, trace: null, over: true };
	}
	if (THINKING_EVENTS.has(event.hook_event_name)) {
		return { at, trace: { label: THINKING_TRACE, recordId: String(at), since: at }, over: false };
	}
	if (event.hook_event_name !== TOOL_OPENED || !event.tool_name) {
		return null;
	}

	const label = codexToolTrace(event.tool_name);
	if (!label) {
		return { at, trace: null, over: false };
	}

	return { at, trace: { label, recordId: event.turn_id ?? String(at), since: at }, over: false };
}

export function codexSpoolReading(tail: string): CodexEdge | null {
	for (const raw of tail.split(SPOOL_SEPARATOR).reverse()) {
		const record = codexSpoolRecord(raw);
		if (!record) {
			continue;
		}

		const edge = eventEdge(record.event, record.at);
		if (edge) {
			return edge;
		}
	}

	return null;
}

export async function codexRead(ref: { sessionId: string }): Promise<HarnessReading> {
	const tail = await readSpoolTail(spoolPath({ harness: CODEX_HARNESS_ID, sessionId: ref.sessionId }));
	if (tail === null) {
		return { trace: null };
	}

	const edge = codexSpoolReading(tail);
	if (!edge) {
		return { trace: null };
	}
	if (edge.over) {
		return { trace: null, endedAt: edge.at };
	}

	return { trace: edge.trace };
}
