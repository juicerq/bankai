import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";
import { refreshReach } from "@renderer/lib/reach";

export function useMobileAccess() {
	const queryClient = useQueryClient();
	const key = orpc.mobile.getAccess.key({ type: "query" });
	const access = useQuery(orpc.mobile.getAccess.queryOptions({ refetchOnMount: "always" }));
	const expose = useMutation(
		orpc.mobile.setExposed.mutationOptions({
			onSuccess: (next) => queryClient.setQueryData(key, next),
		}),
	);
	const tailnet = useMutation(
		orpc.mobile.setTailnetOpen.mutationOptions({
			onSuccess: (next) => queryClient.setQueryData(key, next),
		}),
	);
	const regenerate = useMutation(
		orpc.mobile.regenerateToken.mutationOptions({
			onSuccess: async (next) => {
				await refreshReach();
				queryClient.setQueryData(key, next);
			},
		}),
	);

	return {
		access: access.data,
		failed: !!expose.error || !!regenerate.error || !!tailnet.error,
		working: expose.isPending || regenerate.isPending || tailnet.isPending,
		setExposed: (enabled: boolean) => expose.mutate({ enabled }),
		setTailnetOpen: (open: boolean) => tailnet.mutate({ open }),
		regenerateToken: () => regenerate.mutate({}),
	};
}
