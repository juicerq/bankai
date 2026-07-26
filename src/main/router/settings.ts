import { DEFAULT_HARNESS_SETTINGS, launchableHarnesses } from "@main/activity/harnesses";
import { base } from "@main/router/_base";
import { harnessSchema, layoutSchema, Settings } from "@main/store/settings";

export const settingsRouter = {
	getLayout: base.handler(async () => (await Settings.get()).layout ?? null),
	updateLayout: base.input(layoutSchema).handler(({ input }) => Settings.updateLayout(input)),
	listHarnesses: base.handler(() => launchableHarnesses()),
	getHarness: base.handler(async () => (await Settings.get()).harness ?? DEFAULT_HARNESS_SETTINGS),
	updateHarness: base.input(harnessSchema).handler(({ input }) => Settings.updateHarness(input)),
};
