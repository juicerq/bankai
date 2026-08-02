import type { AgentActivityState } from "@shared/activity";

export type BoundStatus = "working" | "waiting" | "idle";

function deriveShellActivity(
	previous: AgentActivityState | undefined,
	bound: BoundStatus | undefined,
): AgentActivityState | undefined {
	if (bound === "working") {
		return "working";
	}

	const wasActive = previous === "working" || previous === "needs-attention";
	if (!wasActive) {
		return previous;
	}
	if (bound === "idle") {
		return "done";
	}

	return undefined;
}

export function nextShellActivity(
	previous: AgentActivityState | undefined,
	bound?: BoundStatus,
): AgentActivityState | undefined {
	if (bound === "waiting") {
		return "needs-attention";
	}

	return deriveShellActivity(previous, bound);
}

export function clockSince(input: {
	previous: AgentActivityState | undefined;
	next: AgentActivityState | undefined;
	held: number | undefined;
	reported: number | undefined;
}): number | undefined {
	if (input.next !== input.previous) {
		return input.reported;
	}

	return input.held ?? input.reported;
}

export function turnOpen(state: AgentActivityState | undefined): boolean {
	return state === "working" || state === "needs-attention";
}

export function turnStartShells(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const started: string[] = [];

	for (const [sessionId, state] of after) {
		if (turnOpen(state) && !turnOpen(before.get(sessionId))) {
			started.push(sessionId);
		}
	}

	return started;
}

export function attentionEntryShells(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const entered: string[] = [];

	for (const [sessionId, state] of after) {
		if (state === "needs-attention" && before.get(sessionId) !== "needs-attention") {
			entered.push(sessionId);
		}
	}

	return entered;
}

export function doneEntryShells(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const finished: string[] = [];

	for (const [sessionId, state] of after) {
		if (state === "done" && before.get(sessionId) !== "done") {
			finished.push(sessionId);
		}
	}

	return finished;
}
