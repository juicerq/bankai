import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { HarnessProfile, HarnessSettings } from "@main/store/settings";
import { orpc } from "@renderer/lib/api";

function withoutEmptyArguments(profile: HarnessProfile): HarnessProfile {
	const { args, ...rest } = profile;
	if (!args) {
		return rest;
	}

	return { ...rest, args };
}

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
		(patch: Partial<Pick<HarnessSettings, "autostart" | "id">>) => {
			const current = queryClient.getQueryData<HarnessSettings>(key);
			if (!current) {
				return;
			}

			mutation.mutate({ ...current, ...patch });
		},
		[key, mutation.mutate, queryClient],
	);
	const saveProfile = useCallback(
		(patch: Partial<HarnessProfile>) => {
			const current = queryClient.getQueryData<HarnessSettings>(key);
			if (!current) {
				return;
			}

			const profile = withoutEmptyArguments({ ...current.profiles?.[current.id], ...patch });
			mutation.mutate({ ...current, profiles: { ...current.profiles, [current.id]: profile } });
		},
		[key, mutation.mutate, queryClient],
	);

	return {
		harness: stored.data,
		profile: stored.data?.profiles?.[stored.data.id] ?? {},
		harnesses: available.data,
		save,
		saveProfile,
		saveError: mutation.error,
	};
}
