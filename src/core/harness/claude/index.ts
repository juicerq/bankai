import type { HarnessIntegration } from "@core/harness/Harness";
import { ClaudeDiscovery } from "@core/harness/claude/discovery";
import { ClaudeLaunch } from "@core/harness/claude/launch";
import { ClaudeTranscript } from "@core/harness/claude/transcript";

export const ClaudeHarness = {
	id: "claude",
	discovery: ClaudeDiscovery,
	transcript: ClaudeTranscript,
	launch: ClaudeLaunch,
} satisfies HarnessIntegration;
