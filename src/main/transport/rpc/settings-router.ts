import { Harnesses } from "@main/agents/harness/harnesses";
import { HarnessSettings } from "@main/settings/harness-settings";
import { LayoutSettings } from "@main/settings/layout-settings";
import { ThemeSettings } from "@main/settings/theme-settings";
import { base } from "@main/transport/rpc/rpc-base";
import { HarnessAvailability } from "@main/agents/harness/harness-availability";
import { harnessSchema, layoutSchema, themeSchema } from "@shared/settings";
import { type } from "arktype";

export const settingsRouter = {
	getLayout: base.handler(async () => (await LayoutSettings.get()) ?? null),
	updateLayout: base.input(layoutSchema).handler(({ input }) => LayoutSettings.update(input)),
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
	getHarness: base.handler(async () => (await HarnessSettings.get()) ?? Harnesses.DEFAULT_HARNESS_SETTINGS),
	updateHarness: base.input(harnessSchema).handler(({ input }) => HarnessSettings.update(input)),
	getTheme: base.handler(() => ThemeSettings.get()),
	updateTheme: base.input(type({ theme: themeSchema })).handler(({ input }) => ThemeSettings.update(input.theme)),
};
