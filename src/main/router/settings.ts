import { base } from "@main/router/_base";
import { layoutSchema, Settings } from "@main/store/settings";

export const settingsRouter = {
	getLayout: base.handler(async () => (await Settings.get()).layout ?? null),
	updateLayout: base.input(layoutSchema).handler(({ input }) => Settings.updateLayout(input)),
};
