import { type } from "arktype";
import { Logger } from "@main/infra/logger";
import { SettingsStore } from "@main/store/settings-store";
import { Store } from "@main/store/store";
import { type WindowBounds, windowBoundsSchema } from "@shared/settings";

const windowSchema = type({ "bounds?": windowBoundsSchema });

const store = new Store({
	name: "window",
	version: 1,
	contract: windowSchema,
	migrators: {},
	seed: (): typeof windowSchema.infer => ({}),
});

async function readWindowBounds(): Promise<WindowBounds | undefined> {
	try {
		const { bounds } = await store.read();

		return bounds ?? (await SettingsStore.read()).windowBounds;
	} catch (err) {
		Logger.error("window:bounds-read-failed", { err: String(err) });

		return;
	}
}

async function saveWindowBounds(bounds: WindowBounds): Promise<void> {
	await store.write({ bounds });
}

export const WindowBoundsStore = {
	read: readWindowBounds,
	save: saveWindowBounds,
};
