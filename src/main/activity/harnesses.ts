import type { AgentPresence, Harness } from "@main/activity/Harness";
import { ClaudeHarness } from "@main/activity/claude";
import { Logger } from "@main/logger";
import type { HarnessSettings } from "@main/store/settings";
import { DEFAULT_LIVE_TRACE } from "@shared/activity";

const harnesses: Harness[] = [ClaudeHarness];

export const DEFAULT_HARNESS_SETTINGS: HarnessSettings = {
	autostart: true,
	id: ClaudeHarness.id,
	liveTrace: DEFAULT_LIVE_TRACE,
};

export function launchableHarnesses(): { id: string; label: string; file: string }[] {
	return harnesses.flatMap((harness) => {
		const launch = harness.launch;
		if (!launch) {
			return [];
		}

		return [{ id: harness.id, label: harness.label, file: launch().file }];
	});
}

export function harnessLaunch(harnessId: string): Harness["launch"] {
	return harnesses.find((harness) => harness.id === harnessId)?.launch;
}

export function harnessResume(harnessId: string): Harness["resume"] {
	return harnesses.find((harness) => harness.id === harnessId)?.resume;
}

export function harnessTitle(harnessId: string): Harness["title"] {
	return harnesses.find((harness) => harness.id === harnessId)?.title;
}

export function harnessTrace(harnessId: string): Harness["trace"] {
	return harnesses.find((harness) => harness.id === harnessId)?.trace;
}

export async function discoverAgents(): Promise<AgentPresence[]> {
	const discovered = await Promise.all(
		harnesses.map((harness) =>
			harness.discover().catch((err) => {
				Logger.warn("activity:discovery-failed", { harness: harness.id, err: String(err) });
				return [];
			}),
		),
	);

	return discovered.flat();
}
