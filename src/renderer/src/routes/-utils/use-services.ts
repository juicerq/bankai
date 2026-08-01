import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { orpc } from "@renderer/lib/api";
import type { ServiceStatus } from "@shared/services";

export function useServices() {
	const listed = useQuery(orpc.services.list.queryOptions());
	const { mutate: start } = useMutation(orpc.services.start.mutationOptions());
	const { mutate: stop } = useMutation(orpc.services.stop.mutationOptions());
	const states = useMemo(
		() => new Map((listed.data ?? []).map((state) => [state.commandId, state])),
		[listed.data],
	);
	const statusOf = useCallback(
		(commandId: string): ServiceStatus => states.get(commandId)?.status ?? "stopped",
		[states],
	);

	return {
		states,
		statusOf,
		toggle: useCallback((commandId: string) => {
			if (statusOf(commandId) === "running") {
				stop({ commandId });

				return;
			}

			start({ commandId });
		}, [start, statusOf, stop]),
	};
}
