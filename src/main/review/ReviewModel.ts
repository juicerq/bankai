import type { HookEvent } from "@main/hooks/HookGateway";

type DiffLine = {
	turnId: string;
	path: string;
	line: number;
	kind: "add";
	text: string;
};

type FileDiff = {
	path: string;
	lines: DiffLine[];
};

export type Turn = {
	turnId: string;
	prompt: string;
	files: FileDiff[];
};

type SessionStatus = "generating" | "idle" | "blocked";

type SessionState = {
	sessionId: string;
	turns: Turn[];
	open: Turn | null;
	status: SessionStatus;
};

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
				if (!event.filePath || event.content === undefined) {
					return;
				}
				this.recordFileChange(state, event.filePath, event.content);
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

		return state.open ? [...state.turns, state.open] : state.turns;
	}

	getStatus(sessionId: string): SessionStatus {
		return this.sessions.get(sessionId)?.status ?? "idle";
	}

	private stateFor(sessionId: string): SessionState {
		let state = this.sessions.get(sessionId);
		if (!state) {
			state = { sessionId, turns: [], open: null, status: "idle" };
			this.sessions.set(sessionId, state);
		}

		return state;
	}

	private nextTurnId(state: SessionState): string {
		return `${state.sessionId}:${state.turns.length}`;
	}

	private closeOpen(state: SessionState) {
		if (state.open) {
			state.turns.push(state.open);
			state.open = null;
		}
	}

	private recordFileChange(state: SessionState, path: string, content: string) {
		const turn =
			state.open ??
			(state.open = { turnId: this.nextTurnId(state), prompt: "", files: [] });

		let file = turn.files.find((f) => f.path === path);
		if (!file) {
			file = { path, lines: [] };
			turn.files.push(file);
		}

		// Hooks entregam o novo conteúdo, não um diff unificado: cada linha vira um "add"
		// endereçável pela posição no conteúdo emitido. Ceiling: diff real vem do transcript/git (task 05).
		const base = file.lines.length;
		for (const [i, text] of content.split("\n").entries()) {
			file.lines.push({
				turnId: turn.turnId,
				path,
				line: base + i + 1,
				kind: "add",
				text,
			});
		}
	}

	private emit(sessionId: string) {
		for (const cb of this.listeners) {
			cb(sessionId);
		}
	}
}

export const Review = new ReviewModel();
