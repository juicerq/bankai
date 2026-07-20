import type { HarnessLaunch } from "@core/harness/Harness";

export const PiLaunch: HarnessLaunch = {
	resume: (sessionId) => ["pi", "--session", sessionId],
	fresh: () => ["pi"],
};
