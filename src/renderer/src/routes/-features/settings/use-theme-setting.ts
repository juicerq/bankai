import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";
import { Theme } from "@renderer/lib/theme";
import { DEFAULT_THEME, type ThemePreference } from "@shared/theme";

export function useThemeSetting() {
	const queryClient = useQueryClient();
	const key = orpc.settings.getTheme.key({ type: "query" });
	const { data } = useQuery(orpc.settings.getTheme.queryOptions());
	const { mutate, error } = useMutation(
		orpc.settings.updateTheme.mutationOptions({
			onMutate: ({ theme }) => {
				const previous = queryClient.getQueryData<ThemePreference>(key) ?? DEFAULT_THEME;
				queryClient.setQueryData(key, theme);
				Theme.set(theme);

				return { previous };
			},
			onError: (_err, _input, context) => {
				const previous = context?.previous ?? DEFAULT_THEME;
				queryClient.setQueryData(key, previous);
				Theme.set(previous);
			},
		}),
	);

	return {
		theme: data ?? DEFAULT_THEME,
		saveError: error,
		save: (theme: ThemePreference) => mutate({ theme }),
	};
}
