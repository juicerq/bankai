import { SettingsStore } from "@main/store/settings-store";
import type { HarnessSettings as HarnessSettingsValue } from "@shared/settings";

export const HarnessSettings = {
	get: async (): Promise<HarnessSettingsValue | undefined> => (await SettingsStore.read()).harness,

	update: async (harness: HarnessSettingsValue): Promise<HarnessSettingsValue> => {
		await SettingsStore.mutate((current) => ({ ...current, harness }));

		return harness;
	},
};
