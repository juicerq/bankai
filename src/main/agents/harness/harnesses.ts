import type { AgentPresence, Harness } from "@main/agents/harness/harness";
import { ClaudeHarness } from "@main/agents/harness/claude/claude-harness";
import { CodexHarness } from "@main/agents/harness/codex/codex-harness";
import { OpencodeHarness } from "@main/agents/harness/opencode/opencode-harness";
import { Logger } from "@main/infra/logger";
import type { HarnessSettings } from "@shared/settings";

const harnesses: Harness[] = [ClaudeHarness, CodexHarness, OpencodeHarness];

const DEFAULT_HARNESS_SETTINGS: HarnessSettings = {
	autostart: true,
	id: ClaudeHarness.id,
};

function launchableHarnesses() {
	return harnesses.flatMap((harness) => {
		const launch = harness.launch;
		if (!launch) {
			return [];
		}

		return [
			{
				id: harness.id,
				label: harness.label,
				conversation: !!harness.conversation,
				file: launch().file,
			},
		];
	});
}

function getHarness(harnessId: string): Harness | undefined {
	return harnesses.find((harness) => harness.id === harnessId);
}

function harnessWatchPaths(): string[] {
	return harnesses.flatMap((harness) => harness.watch?.() ?? []);
}

async function discoverAgents(): Promise<AgentPresence[]> {
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

export const Harnesses = {
	DEFAULT_HARNESS_SETTINGS,
	launchable: launchableHarnesses,
	get: getHarness,
	watchPaths: harnessWatchPaths,
	discoverAgents,
};
