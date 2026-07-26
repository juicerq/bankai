import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { HarnessSettings } from "@main/store/settings";
import { orpc } from "@renderer/lib/api";

export function useHarnessSettings() {
	const queryClient = useQueryClient();
	const stored = useQuery(orpc.settings.getHarness.queryOptions());
	const available = useQuery(orpc.settings.listHarnesses.queryOptions());
	const mutation = useMutation(
		orpc.settings.updateHarness.mutationOptions({
			onSuccess: (harness) => queryClient.setQueryData(orpc.settings.getHarness.key({ type: "query" }), harness),
		}),
	);
	const save = useCallback((harness: HarnessSettings) => mutation.mutate(harness), [mutation.mutate]);

	return { harness: stored.data, harnesses: available.data, save };
}
