import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { orpc } from "@renderer/lib/api";

export function useNewShell() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { mutateAsync } = useMutation(orpc.continuity.openShell.mutationOptions());

	return useCallback(
		async (projectId: string) => {
			const shell = { id: crypto.randomUUID() };
			const value = await mutateAsync({ projectId, shell });

			queryClient.setQueryData(orpc.continuity.get.queryOptions().queryKey, (previous) => ({
				value,
				failed: previous?.failed ?? false,
			}));
			await navigate({ to: "/mobile/$shellId", params: { shellId: shell.id } });
		},
		[mutateAsync, navigate, queryClient],
	);
}
