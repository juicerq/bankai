import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useSessions } from "@renderer/routes/-utils/use-sessions";

export function useNewShell() {
	const navigate = useNavigate();
	const { openShellAsync } = useSessions();

	return useCallback(
		async (projectId: string) => {
			const shellId = await openShellAsync(projectId);

			await navigate({ to: "/mobile/$shellId", params: { shellId } });
		},
		[navigate, openShellAsync],
	);
}
