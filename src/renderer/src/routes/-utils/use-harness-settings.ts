import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { HarnessSettings } from "@main/store/settings";
import { orpc } from "@renderer/lib/api";

export function useHarnessSettings() {
	const queryClient = useQueryClient();
	const key = orpc.settings.getHarness.key({ type: "query" });
	const stored = useQuery(orpc.settings.getHarness.queryOptions());
	const available = useQuery(orpc.settings.listHarnesses.queryOptions());
	const mutation = useMutation(
		orpc.settings.updateHarness.mutationOptions({
			onMutate: (harness) => {
				const previous = queryClient.getQueryData<HarnessSettings>(key);
				queryClient.setQueryData(key, harness);

				return { previous };
			},
			onError: (_err, _harness, context) => {
				queryClient.setQueryData(key, context?.previous);
			},
		}),
	);
	const save = useCallback(
		(patch: Partial<HarnessSettings>) => {
			const current = queryClient.getQueryData<HarnessSettings>(key);
			if (!current) {
				return;
			}

			const { args, ...rest } = { ...current, ...patch };
			mutation.mutate(args ? { ...rest, args } : rest);
		},
		[key, mutation.mutate, queryClient],
	);

	return { harness: stored.data, harnesses: available.data, save, saveError: mutation.error };
}
