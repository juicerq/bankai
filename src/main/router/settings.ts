import { DEFAULT_HARNESS_SETTINGS, launchableHarnesses } from "@main/activity/harnesses";
import { applyLiveTrace } from "@main/activity/liveTrace";
import { base } from "@main/router/_base";
import { harnessSchema, layoutSchema, Settings } from "@main/store/settings";
import { harnessAvailable } from "@main/terminal/harnessAvailability";

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
	updateHarness: base.input(harnessSchema).handler(async ({ input }) => {
		const saved = await Settings.updateHarness(input);
		await applyLiveTrace(saved);

		return saved;
	}),
};
