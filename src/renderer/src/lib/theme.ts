import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";
import { DEFAULT_THEME, resolveTheme, THEME_BACKGROUND, THEME_LIGHT_CLASS, type ThemePreference } from "@shared/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();

let preference: ThemePreference = DEFAULT_THEME;

function paint(next: ThemePreference) {
	preference = next;
	const root = document.documentElement;
	const wanted = resolveTheme(next, () => window.matchMedia(DARK_QUERY).matches);
	const changed = root.classList.contains(THEME_LIGHT_CLASS) !== (wanted === "light");

	root.classList.toggle(THEME_LIGHT_CLASS, wanted === "light");
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BACKGROUND[wanted]);

	if (!changed) {
		return;
	}

	for (const listener of listeners) {
		listener();
	}
}

export const Theme = {
	install: ({ queryClient }: { queryClient: QueryClient }) => {
		window.matchMedia(DARK_QUERY).addEventListener("change", () => paint(preference));

		queryClient
			.fetchQuery(orpc.settings.getTheme.queryOptions())
			.then(paint)
			.catch((err) => console.error("theme read failed", err));
	},
	set: paint,
	subscribe: (listener: () => void) => {
		listeners.add(listener);

		return () => {
			listeners.delete(listener);
		};
	},
};
