import { SettingsStore } from "@main/store/settings-store";
import type { VapidKeys } from "@shared/settings";

export const PushSettings = {
	ensureKeys: async (mint: () => VapidKeys): Promise<VapidKeys> => {
		const current = await SettingsStore.read();
		if (current.vapid) {
			return current.vapid;
		}

		const vapid = mint();
		await SettingsStore.mutate((value) => ({ ...value, vapid }));

		return vapid;
	},
};
