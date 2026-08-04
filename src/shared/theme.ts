export const THEME_PREFERENCES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const DEFAULT_THEME: ThemePreference = "dark";

export const THEME_LIGHT_CLASS = "theme-light";

export const THEME_BACKGROUND: Record<ResolvedTheme, string> = {
	dark: "#060606",
	light: "#f3f1ea",
};

export const THEME_ARGUMENTS: Record<ResolvedTheme, string> = {
	dark: "--bankai-theme=dark",
	light: "--bankai-theme=light",
};

export function resolveTheme(preference: ThemePreference, systemDark: () => boolean): ResolvedTheme {
	if (preference !== "system") {
		return preference;
	}

	if (systemDark()) {
		return "dark";
	}

	return "light";
}

export function themeFromArguments(argv: string[]): ResolvedTheme {
	if (argv.includes(THEME_ARGUMENTS.light)) {
		return "light";
	}

	return "dark";
}
