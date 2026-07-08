import type { HookEvent } from "@core/hooks/HookGateway";

export type FileSnapshot = {
	path: string;
	before: string[];
	after: string[];
};

export type Turn = {
	turnId: string;
	prompt: string;
	files: FileSnapshot[];
};

export type SessionStatus = "generating" | "idle" | "blocked";

type SessionState = {
	sessionId: string;
	turns: Turn[];
	open: Turn | null;
	status: SessionStatus;
	files: Map<string, string[]>;
};

function applyEdit(
	text: string,
	oldString: string | undefined,
	newString: string,
	replaceAll: boolean | undefined,
): string {
	if (!oldString) {
		return text;
	}

	return replaceAll
		? text.replaceAll(oldString, () => newString)
		: text.replace(oldString, () => newString);
}

function nextContent(prev: string[] | undefined, event: HookEvent): string[] | null {
	if (event.content !== undefined) {
		return event.content.split("\n");
	}

	if (event.newString !== undefined) {
		const base = event.originalContent ?? prev?.join("\n");
		if (base !== undefined) {
			return applyEdit(base, event.oldString, event.newString, event.replaceAll).split("\n");
		}

		return event.newString.split("\n");
	}

	return null;
}

function baselineFor(event: HookEvent): string[] {
	return event.oldString ? event.oldString.split("\n") : [];
}

export class ReviewModel {
	private readonly sessions = new Map<string, SessionState>();
	private readonly listeners = new Set<(sessionId: string) => void>();

	onChange(cb: (sessionId: string) => void) {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	apply(event: HookEvent) {
		const state = this.stateFor(event.sessionId);

		switch (event.event) {
			case "UserPromptSubmit": {
				this.closeOpen(state);
				state.open = {
					turnId: this.nextTurnId(state),
					prompt: event.prompt ?? "",
					files: [],
				};
				state.status = "generating";
				break;
			}
			case "PostToolUse": {
				const path = event.filePath;
				if (!path || (event.content === undefined && event.newString === undefined)) {
					return;
				}

				this.recordFileChange(state, path, event);
				break;
			}
			case "Stop": {
				this.closeOpen(state);
				state.status = "idle";
				break;
			}
			case "Notification": {
				// Conservador (D7): só bloqueia num pedido de permissão, ignora idle blips.
				// Ceiling: heurística pelo texto da mensagem — task 07 refina e cruza com unreviewed-count.
				if (!event.message || !/permission/i.test(event.message)) {
					return;
				}
				state.status = "blocked";
				break;
			}
		}

		this.emit(event.sessionId);
	}

	getTurns(sessionId: string): Turn[] {
		const state = this.sessions.get(sessionId);
		if (!state) {
			return [];
		}

		if (state.open && state.open.files.length > 0) {
			return [...state.turns, state.open];
		}

		return state.turns;
	}

	getStatus(sessionId: string): SessionStatus {
		return this.sessions.get(sessionId)?.status ?? "idle";
	}

	private stateFor(sessionId: string): SessionState {
		let state = this.sessions.get(sessionId);
		if (!state) {
			state = {
				sessionId,
				turns: [],
				open: null,
				status: "idle",
				files: new Map(),
			};
			this.sessions.set(sessionId, state);
		}

		return state;
	}

	private nextTurnId(state: SessionState): string {
		return `${state.sessionId}:${state.turns.length}`;
	}

	private closeOpen(state: SessionState) {
		if (state.open && state.open.files.length > 0) {
			state.turns.push(state.open);
		}

		state.open = null;
	}

	private recordFileChange(state: SessionState, path: string, event: HookEvent) {
		const turn =
			state.open ?? (state.open = { turnId: this.nextTurnId(state), prompt: "", files: [] });

		const prev = state.files.get(path);
		const after = nextContent(prev, event);
		if (!after) {
			return;
		}

		state.files.set(path, after);

		const existing = turn.files.find((f) => f.path === path);
		if (existing) {
			existing.after = after;
		} else {
			const before =
				event.originalContent === undefined
					? (prev ?? baselineFor(event))
					: event.originalContent.split("\n");
			turn.files.push({ path, before, after });
		}
	}

	private emit(sessionId: string) {
		for (const cb of this.listeners) {
			cb(sessionId);
		}
	}
}
