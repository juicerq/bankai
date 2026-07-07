import type { HookEvent } from "@core/hooks/HookGateway";

type DiffLine = {
	turnId: string;
	path: string;
	line: number;
	kind: "add" | "context";
	text: string;
};

export type FileDiff = {
	path: string;
	lines: DiffLine[];
};

export type Turn = {
	turnId: string;
	prompt: string;
	files: FileDiff[];
};

export type SessionStatus = "generating" | "idle" | "blocked";

type FileLine = { text: string; origin: string | null };

type SessionState = {
	sessionId: string;
	turns: Turn[];
	open: Turn | null;
	status: SessionStatus;
	files: Map<string, FileLine[]>;
};

// Past this many lines the line-by-line diff is skipped and every line falls back to
// "add", so a huge generated file can't stall the main process. Upgrade path: Myers/
// Hirschberg to keep the diff without the O(m*n) table.
const DIFF_CAP_LINES = 3000;

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
		? text.replaceAll(oldString, newString)
		: text.replace(oldString, newString);
}

function diffLines(
	prev: FileLine[],
	next: string[],
	turnId: string,
): FileLine[] {
	if (prev.length > DIFF_CAP_LINES || next.length > DIFF_CAP_LINES) {
		return next.map((text) => ({ text, origin: turnId }));
	}

	const m = prev.length;
	const n = next.length;
	const w = n + 1;
	const dp = new Uint16Array((m + 1) * w);

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i * w + j] =
				prev[i - 1]!.text === next[j - 1]!
					? dp[(i - 1) * w + (j - 1)]! + 1
					: Math.max(dp[(i - 1) * w + j]!, dp[i * w + (j - 1)]!);
		}
	}

	const origin: (string | null)[] = Array.from({ length: n }, () => turnId);
	let i = m;
	let j = n;
	while (i > 0 && j > 0) {
		if (prev[i - 1]!.text === next[j - 1]!) {
			origin[j - 1] = prev[i - 1]!.origin;
			i--;
			j--;
		} else if (dp[(i - 1) * w + j]! >= dp[i * w + (j - 1)]!) {
			i--;
		} else {
			j--;
		}
	}

	return next.map((text, k) => ({ text, origin: origin[k]! }));
}

function rebuildContent(
	prev: FileLine[] | undefined,
	event: HookEvent,
	turnId: string,
): FileLine[] | null {
	if (event.content !== undefined) {
		return diffLines(prev ?? [], event.content.split("\n"), turnId);
	}

	if (event.newString !== undefined) {
		if (prev) {
			const nextText = applyEdit(
				prev.map((l) => l.text).join("\n"),
				event.oldString,
				event.newString,
				event.replaceAll,
			);
			return diffLines(prev, nextText.split("\n"), turnId);
		}

		const baseline: FileLine[] = event.oldString
			? event.oldString.split("\n").map((text) => ({ text, origin: null }))
			: [];
		return diffLines(baseline, event.newString.split("\n"), turnId);
	}

	return null;
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
				if (
					!path ||
					(event.content === undefined && event.newString === undefined)
				) {
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

		return state.open ? [...state.turns, state.open] : state.turns;
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
		if (state.open) {
			state.turns.push(state.open);
			state.open = null;
		}
	}

	private recordFileChange(
		state: SessionState,
		path: string,
		event: HookEvent,
	) {
		const turn =
			state.open ??
			(state.open = { turnId: this.nextTurnId(state), prompt: "", files: [] });

		const rebuilt = rebuildContent(state.files.get(path), event, turn.turnId);
		if (!rebuilt) {
			return;
		}

		state.files.set(path, rebuilt);

		const lines: DiffLine[] = rebuilt.map((l, i) => ({
			turnId: l.origin ?? "",
			path,
			line: i + 1,
			kind: l.origin === turn.turnId ? "add" : "context",
			text: l.text,
		}));

		const existing = turn.files.find((f) => f.path === path);
		if (existing) {
			existing.lines = lines;
		} else {
			turn.files.push({ path, lines });
		}
	}

	private emit(sessionId: string) {
		for (const cb of this.listeners) {
			cb(sessionId);
		}
	}
}
