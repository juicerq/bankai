import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { orpc } from "@renderer/lib/api";

export function useReviewInvalidation() {
	const queryClient = useQueryClient();

	// Integração com event emitter externo (raw IPC): o ping review:changed dos hooks
	// invalida a Query dos turns da sessão que mudou.
	useEffect(() => {
		// Preload antigo (HMR) pode ainda não ter exposto window.review: vira no-op.
		if (!window.review) {
			return;
		}

		return window.review.onChanged((sessionId) => {
			queryClient.invalidateQueries({
				queryKey: orpc.review.getTurns.key({ input: { sessionId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.review.status.key({ input: { sessionId } }),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.review.unreviewedCount.key({ input: { sessionId } }),
			});
		});
	}, [queryClient]);
}
