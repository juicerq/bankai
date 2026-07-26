import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";

export function installContinuityPush({ queryClient }: { queryClient: QueryClient }) {
	const { queryKey } = orpc.continuity.get.queryOptions();

	const stopListening = window.bankaiContinuity.onChanged((event) => {
		queryClient.setQueryData(queryKey, (previous) => ({
			value: event.value,
			failed: previous?.failed ?? false,
		}));
	});

	window.bankaiContinuity.subscribe();

	return stopListening;
}
