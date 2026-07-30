import { open } from "node:fs/promises";
import { Logger } from "@main/logger";
import { type } from "arktype";

const ROOT_SOURCE = "cli";

const META_MAX_BYTES = 1024 * 1024;

const SEED_MAX_BYTES = 4 * 1024 * 1024;

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

interface TailCursor {
	offset: number;
	carry: string;
	state: CodexRolloutState;
}

class CodexRolloutTail {
	private readonly cursors = new Map<string, TailCursor>();
	private readonly metas = new Map<string, CodexRolloutMeta | null>();

	async meta(path: string): Promise<CodexRolloutMeta | null> {
		const known = this.metas.get(path);
		if (known !== undefined) {
			return known;
		}

		const meta = await this.readMeta(path);
		if (meta !== undefined) {
			this.metas.set(path, meta);
		}

		return meta ?? null;
	}

	async state(path: string): Promise<CodexRolloutState> {
		const held = this.cursors.get(path);
		const handle = await open(path, "r").catch((err: unknown) => {
			Logger.info("codex:rollout-unreadable", { path, err: String(err) });

			return null;
		});
		if (!handle) {
			return held?.state ?? IDLE_ROLLOUT;
		}

		try {
			const { size } = await handle.stat();
			const cursor = held && held.offset <= size ? held : undefined;
			const from = cursor?.offset ?? Math.max(0, size - SEED_MAX_BYTES);
			if (cursor && from === size) {
				return cursor.state;
			}

			const { buffer, bytesRead } = await handle.read({
				buffer: Buffer.alloc(size - from),
				position: from,
			});
			const lines = ((cursor?.carry ?? "") + buffer.toString("utf8", 0, bytesRead)).split("\n");
			const carry = lines.pop() ?? "";
			const records = cursor || from === 0 ? lines : lines.slice(1);
			const next = {
				offset: from + bytesRead,
				carry,
				state: turnAfter(cursor?.state ?? IDLE_ROLLOUT, records),
			};
			this.cursors.set(path, next);

			return next.state;
		} finally {
			await handle.close();
		}
	}

	forget(live: ReadonlySet<string>): void {
		for (const path of this.cursors.keys()) {
			if (!live.has(path)) {
				this.cursors.delete(path);
			}
		}
		for (const path of this.metas.keys()) {
			if (!live.has(path)) {
				this.metas.delete(path);
			}
		}
	}

	private async readMeta(path: string): Promise<CodexRolloutMeta | null | undefined> {
		const handle = await open(path, "r").catch((err: unknown) => {
			Logger.info("codex:rollout-unreadable", { path, err: String(err) });

			return null;
		});
		if (!handle) {
			return undefined;
		}

		try {
			const { buffer, bytesRead } = await handle.read({
				buffer: Buffer.alloc(META_MAX_BYTES),
				position: 0,
			});
			const head = buffer.toString("utf8", 0, bytesRead);
			const end = head.indexOf("\n");
			if (end < 0) {
				return null;
			}

			return rolloutMeta(head.slice(0, end));
		} finally {
			await handle.close();
		}
	}
}

export const codexRollouts = new CodexRolloutTail();
