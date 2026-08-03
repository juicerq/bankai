import { DEFAULT_HARNESS_SETTINGS, launchableHarnesses } from "@main/agents/harness/harnesses";
import { base } from "@main/transport/rpc/rpc-base";
import { harnessSchema, layoutSchema, Settings } from "@main/store/settings";
import { harnessAvailable } from "@main/agents/harness/harness-availability";

export const settingsRouter = {
	getLayout: base.handler(async () => (await Settings.get()).layout ?? null),
	updateLayout: base.input(layoutSchema).handler(({ input }) => Settings.updateLayout(input)),
	listHarnesses: base.handler(() =>
		Promise.all(
			launchableHarnesses().map(async (harness) => ({
				id: harness.id,
				label: harness.label,
				conversation: harness.conversation,
				available: await harnessAvailable(harness.file),
			})),
		)
	),
	getHarness: base.handler(async () => (await Settings.get()).harness ?? DEFAULT_HARNESS_SETTINGS),
	updateHarness: base.input(harnessSchema).handler(({ input }) => Settings.updateHarness(input)),
};
