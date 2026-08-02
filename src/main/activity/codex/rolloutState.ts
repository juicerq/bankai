import { type } from "arktype";

const ROOT_SOURCE = "cli";

const TURN_OPENED = "task_started";

const TURN_CLOSED = new Set(["task_complete", "turn_aborted"]);

const SECOND_MS = 1000;

export interface CodexRolloutMeta {
	sessionId: string;
	cwd: string;
	root: boolean;
}

const metaSchema = type({
	type: "'session_meta'",
	payload: {
		session_id: "string",
		cwd: "string",
		source: "unknown",
		"parent_thread_id?": "string | null",
	},
}).pipe(
	(raw): CodexRolloutMeta => ({
		sessionId: raw.payload.session_id,
		cwd: raw.payload.cwd,
		root: raw.payload.source === ROOT_SOURCE && !raw.payload.parent_thread_id,
	}),
);

const turnEventSchema = type({
	type: "'event_msg'",
	payload: {
		type: "string",
		"turn_id?": "string",
		"started_at?": "number",
		"completed_at?": "number",
	},
});

function parsed(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export function rolloutMeta(raw: string): CodexRolloutMeta | null {
	const meta = metaSchema(parsed(raw));
	if (meta instanceof type.errors) {
		return null;
	}

	return meta;
}

interface CodexTurn {
	turnId: string;
	startedAt: number;
}

export interface CodexRolloutState {
	turn: CodexTurn | null;
	endedAt?: number;
}

export const IDLE_ROLLOUT: CodexRolloutState = { turn: null };

export function turnAfter(previous: CodexRolloutState, lines: string[]): CodexRolloutState {
	let state = previous;

	for (const line of lines) {
		const event = turnEventSchema(parsed(line));
		if (event instanceof type.errors) {
			continue;
		}

		const { type: name, turn_id: turnId, started_at: startedAt, completed_at: completedAt } = event.payload;
		if (name === TURN_OPENED && turnId !== undefined && startedAt !== undefined) {
			state = { turn: { turnId, startedAt: startedAt * SECOND_MS } };
			continue;
		}
		if (TURN_CLOSED.has(name)) {
			state = {
				turn: null,
				endedAt: completedAt === undefined ? Date.now() : completedAt * SECOND_MS,
			};
		}
	}

	return state;
}
