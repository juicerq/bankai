import { SettingsStore } from "@main/store/settings-store";
import { DEFAULT_THEME, type ThemePreference } from "@shared/theme";

export const ThemeSettings = {
	get: async (): Promise<ThemePreference> => (await SettingsStore.read()).theme ?? DEFAULT_THEME,

	update: async (theme: ThemePreference): Promise<ThemePreference> => {
		await SettingsStore.mutate((current) => ({ ...current, theme }));

		return theme;
	},
};
