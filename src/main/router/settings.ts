import { base } from "@main/router/_base";
import { Settings, settingsUpdateSchema } from "@main/store/settings";

export const settingsRouter = {
	get: base.handler(() => Settings.get()),
	update: base
		.input(settingsUpdateSchema)
		.handler(({ input }) => Settings.update(input)),
};
