import { Harnesses } from "@main/agents/harness/harnesses";
import { base } from "@main/transport/rpc/rpc-base";
import { harnessSchema, layoutSchema, Settings } from "@main/store/settings";
import { HarnessAvailability } from "@main/agents/harness/harness-availability";

export const settingsRouter = {
	getLayout: base.handler(async () => (await Settings.get()).layout ?? null),
	updateLayout: base.input(layoutSchema).handler(({ input }) => Settings.updateLayout(input)),
	listHarnesses: base.handler(() =>
		Promise.all(
			Harnesses.launchable().map(async (harness) => ({
				id: harness.id,
				label: harness.label,
				conversation: harness.conversation,
				available: await HarnessAvailability.check(harness.file),
			})),
		)
	),
	getHarness: base.handler(async () => (await Settings.get()).harness ?? Harnesses.DEFAULT_HARNESS_SETTINGS),
	updateHarness: base.input(harnessSchema).handler(({ input }) => Settings.updateHarness(input)),
};
