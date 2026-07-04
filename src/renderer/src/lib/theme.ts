import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Theme } from "@main/store/settings";
import { orpc } from "@renderer/lib/api";

const DEFAULT_THEME: Theme = "system";

function applyThemeClass(theme: Theme) {
	const isDark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme() {
	const queryClient = useQueryClient();
	const query = useQuery(orpc.settings.get.queryOptions());
	const theme: Theme = query.data?.theme ?? DEFAULT_THEME;

	const mutation = useMutation(
		orpc.settings.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.settings.get.key(),
				});
			},
		}),
	);

	useEffect(() => {
		applyThemeClass(theme);

		if (theme !== "system") {
			return;
		}

		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeClass("system");
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [theme]);

	return { theme, setTheme: (next: Theme) => mutation.mutate({ theme: next }) };
}
