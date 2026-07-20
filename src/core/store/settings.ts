import { type } from "arktype";
import { type HarnessId, harnessId } from "@core/harness/registry";
import { Store } from "@core/store/Store";

const settingsContract = type({ defaultHarness: harnessId });

type SettingsValue = typeof settingsContract.infer;

const store = new Store({
	name: "settings",
	version: 1,
	contract: settingsContract,
	migrators: {},
	seed: (): SettingsValue => ({ defaultHarness: "claude" }),
});

export const Settings = {
	read: () => store.read(),
	setDefaultHarness: (defaultHarness: HarnessId) =>
		store.mutate((current) => ({ ...current, defaultHarness })),
};
