import type { AgentPresence, Harness } from "@main/activity/Harness";
import { ClaudeHarness } from "@main/activity/claude";
import { CodexHarness } from "@main/activity/codex";
import { Logger } from "@main/logger";
import type { HarnessSettings } from "@main/store/settings";

const harnesses: Harness[] = [ClaudeHarness, CodexHarness];

export const DEFAULT_HARNESS_SETTINGS: HarnessSettings = {
	autostart: true,
	id: ClaudeHarness.id,
};

export function harnessIds(): string[] {
	return harnesses.map((harness) => harness.id);
}

export function launchableHarnesses() {
	return harnesses.flatMap((harness) => {
		const launch = harness.launch;
		if (!launch) {
			return [];
		}

		return [
			{
				id: harness.id,
				label: harness.label,
				conversation: harness.conversation,
				file: launch().file,
			},
		];
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

export function harnessProposeName(harnessId: string): Harness["proposeName"] {
	return harnesses.find((harness) => harness.id === harnessId)?.proposeName;
}

export function harnessLiveTrace(harnessId: string): Harness["liveTrace"] {
	return harnesses.find((harness) => harness.id === harnessId)?.liveTrace;
}

export function harnessReader(harnessId: string): Harness["read"] {
	return harnesses.find((harness) => harness.id === harnessId)?.read;
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
