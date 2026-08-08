import { SettingsStore } from "@main/store/settings-store";
import type { WindowBounds } from "@shared/settings";
import { DEFAULT_THEME, type ThemePreference } from "@shared/theme";

export interface WindowStartupSettings {
	windowBounds?: WindowBounds;
	theme: ThemePreference;
}

export const WindowSettings = {
	startup: async (): Promise<WindowStartupSettings> => {
		const settings = await SettingsStore.read();

		return {
			...(settings.windowBounds && { windowBounds: settings.windowBounds }),
			theme: settings.theme ?? DEFAULT_THEME,
		};
	},

	update: async (windowBounds: WindowBounds): Promise<void> => {
		await SettingsStore.mutate((current) => ({ ...current, windowBounds }));
	},
};
