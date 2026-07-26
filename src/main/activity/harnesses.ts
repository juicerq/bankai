import type { AgentPresence, Harness } from "@main/activity/Harness";
import { ClaudeHarness } from "@main/activity/claude";
import { Logger } from "@main/logger";

const harnesses: Harness[] = [ClaudeHarness];

export function harnessResume(harnessId: string): Harness["resume"] {
	return harnesses.find((harness) => harness.id === harnessId)?.resume;
}

export function harnessTitle(harnessId: string): Harness["title"] {
	return harnesses.find((harness) => harness.id === harnessId)?.title;
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
