import type { HarnessIntegration } from "@core/harness/Harness";
import { PiDiscovery } from "@core/harness/pi/discovery";
import { PiLaunch } from "@core/harness/pi/launch";
import { PiTranscript } from "@core/harness/pi/transcript";

export const PiHarness = {
	id: "pi",
	discovery: PiDiscovery,
	transcript: PiTranscript,
	launch: PiLaunch,
} satisfies HarnessIntegration;
