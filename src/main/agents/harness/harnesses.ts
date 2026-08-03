import type { AgentPresence, Harness } from "@main/agents/harness/harness";
import { ClaudeHarness } from "@main/agents/harness/claude/claude-harness";
import { CodexHarness } from "@main/agents/harness/codex/codex-harness";
import { Logger } from "@main/infra/logger";
import type { HarnessSettings } from "@main/store/settings";

const harnesses: Harness[] = [ClaudeHarness, CodexHarness];

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

function harnessConversation(harnessId: string): Harness["conversation"] {
	return harnesses.find((harness) => harness.id === harnessId)?.conversation;
}

function harnessLaunch(harnessId: string): Harness["launch"] {
	return harnesses.find((harness) => harness.id === harnessId)?.launch;
}

function harnessResume(harnessId: string): Harness["resume"] {
	return harnesses.find((harness) => harness.id === harnessId)?.resume;
}

function harnessTitle(harnessId: string): Harness["title"] {
	return harnesses.find((harness) => harness.id === harnessId)?.title;
}

function harnessProposeName(harnessId: string): Harness["proposeName"] {
	return harnesses.find((harness) => harness.id === harnessId)?.proposeName;
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
	conversation: harnessConversation,
	launch: harnessLaunch,
	resume: harnessResume,
	title: harnessTitle,
	proposeName: harnessProposeName,
	watchPaths: harnessWatchPaths,
	discoverAgents,
};
