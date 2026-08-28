import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { orpc } from "@renderer/lib/api";
import type { ServiceStatus } from "@shared/services";

export function useServiceOutput({ commandId, status }: { commandId: string | undefined; status: ServiceStatus }) {
	const { data: output, isPending: pending } = useQuery(orpc.services.output.queryOptions({
		input: commandId ? { commandId } : skipToken,
		enabled: !!commandId && status !== "running",
	}));

	return { output, pending };
}

export function useServices() {
	const listed = useQuery(orpc.services.list.queryOptions());
	const { mutate: start } = useMutation(orpc.services.start.mutationOptions());
	const { mutate: stop } = useMutation(orpc.services.stop.mutationOptions());
	const { mutate: restart } = useMutation(orpc.services.restart.mutationOptions());
	const states = useMemo(
		() => new Map((listed.data ?? []).map((state) => [state.commandId, state])),
		[listed.data],
	);
	const statusOf = useCallback(
		(commandId?: string): ServiceStatus => {
			if (!commandId) {
				return "stopped";
			}

			return states.get(commandId)?.status ?? "stopped";
		},
		[states],
	);

	return {
		states,
		statusOf,
		start: useCallback((commandId: string) => start({ commandId }), [start]),
		stop: useCallback((commandId: string) => stop({ commandId }), [stop]),
		restart: useCallback((commandId: string) => restart({ commandId }), [restart]),
		toggle: useCallback((commandId: string) => {
			if (statusOf(commandId) === "running") {
				stop({ commandId });

				return;
			}

			start({ commandId });
		}, [start, statusOf, stop]),
	};
}
