import type { HarnessIntegration } from "@core/harness/Harness";
import { CodexDiscovery } from "@core/harness/codex/discovery";
import { CodexLaunch } from "@core/harness/codex/launch";
import { CodexTranscript } from "@core/harness/codex/transcript";

export const CodexHarness = {
	id: "codex",
	discovery: CodexDiscovery,
	transcript: CodexTranscript,
	launch: CodexLaunch,
} satisfies HarnessIntegration;
