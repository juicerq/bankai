import { SettingsStore } from "@main/store/settings-store";
import type { LayoutSettings as LayoutSettingsValue } from "@shared/settings";

export const LayoutSettings = {
	get: async (): Promise<LayoutSettingsValue | undefined> => (await SettingsStore.read()).layout,

	update: async (patch: LayoutSettingsValue): Promise<LayoutSettingsValue> => {
		const next = await SettingsStore.mutate((current) => ({
			...current,
			layout: { ...current.layout, ...patch },
		}));

		return next.layout ?? {};
	},
};
