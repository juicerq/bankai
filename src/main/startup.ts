import { Logger } from "@main/logger";

export interface StartupStep {
	stage: string;
	elapsedMs: number;
	stepMs: number;
}

const marks: { stage: string; elapsedMs: number }[] = [];

export function markStartup(stage: string): void {
	const processStart = process.getCreationTime();
	if (processStart === null) {
		return;
	}

	marks.push({ stage, elapsedMs: Math.round(Date.now() - processStart) });
}

export function startupSteps(elapsed: { stage: string; elapsedMs: number }[]): StartupStep[] {
	const ordered = [...elapsed].sort((left, right) => left.elapsedMs - right.elapsedMs);

	return ordered.map((mark, index) => ({
		stage: mark.stage,
		elapsedMs: mark.elapsedMs,
		stepMs: mark.elapsedMs - (ordered[index - 1]?.elapsedMs ?? 0),
	}));
}

export function reportStartup(): void {
	const last = marks.at(-1);
	if (!last) {
		return;
	}

	Logger.info("startup:timing", { totalMs: last.elapsedMs, steps: startupSteps(marks) });
	marks.length = 0;
}
