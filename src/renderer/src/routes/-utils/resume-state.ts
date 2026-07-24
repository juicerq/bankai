type ResumePhase = "plain" | "resuming" | "resumed" | "failed-retryable" | "retrying" | "failed-final";

export interface ResumeState {
	phase: ResumePhase;
	reason?: string;
}

export type ResumeOutcome = { kind: "resumed" } | { kind: "failed"; reason: string };
export type ResumeEvent = ResumeOutcome | { kind: "retry" };

export function initialResumeState(resumeOnMount: boolean): ResumeState {
	return { phase: resumeOnMount ? "resuming" : "plain" };
}

export function nextResumeState(state: ResumeState, event: ResumeEvent): ResumeState {
	if (state.phase === "resuming") {
		if (event.kind === "resumed") {
			return { phase: "resumed" };
		}
		if (event.kind === "failed") {
			return { phase: "failed-retryable", reason: event.reason };
		}
	}

	if (state.phase === "failed-retryable" && event.kind === "retry") {
		return { phase: "retrying", reason: state.reason };
	}

	if (state.phase === "retrying") {
		if (event.kind === "resumed") {
			return { phase: "resumed" };
		}
		if (event.kind === "failed") {
			return { phase: "failed-final", reason: event.reason };
		}
	}

	return state;
}

export function resumeNoticeVariant(state: ResumeState): "failed-retryable" | "failed-final" | null {
	if (state.phase === "failed-retryable" || state.phase === "failed-final") {
		return state.phase;
	}

	return null;
}
