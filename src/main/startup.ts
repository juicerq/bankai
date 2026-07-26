import { Logger } from "@main/logger";

export interface StartupStep {
	stage: string;
	elapsedMs: number;
	stepMs: number;
}

const STARTUP_REPORT_GRACE_MS = 15_000;

const marks: { stage: string; elapsedMs: number }[] = [];
let reported = false;

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

export function markRendererStartup(reported: { stage: string; at: number }[]): void {
	const processStart = process.getCreationTime();
	if (processStart === null) {
		return;
	}

	for (const mark of reported) {
		marks.push({ stage: `renderer:${mark.stage}`, elapsedMs: Math.round(mark.at - processStart) });
	}

	reportStartup();
}

export function scheduleStartupReport(): void {
	setTimeout(reportStartup, STARTUP_REPORT_GRACE_MS).unref();
}

function reportStartup(): void {
	const steps = startupSteps(marks);
	const last = steps.at(-1);
	if (reported || !last) {
		return;
	}

	reported = true;
	Logger.info("startup:timing", { totalMs: last.elapsedMs, steps });
	marks.length = 0;
}
