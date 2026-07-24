import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ContinuityShell, ContinuityValue } from "@main/store/continuity";
import { orpc } from "@renderer/lib/api";

const EMPTY_CONTINUITY: ContinuityValue = { workspaces: [] };

export function useContinuity() {
	const { data } = useQuery(orpc.continuity.get.queryOptions());
	const { mutate: activate } = useMutation(orpc.continuity.activateProject.mutationOptions());
	const { mutate: open } = useMutation(orpc.continuity.openShell.mutationOptions());
	const { mutate: close } = useMutation(orpc.continuity.closeShell.mutationOptions());
	const { mutate: move } = useMutation(orpc.continuity.moveShell.mutationOptions());
	const { mutate: select } = useMutation(orpc.continuity.selectShell.mutationOptions());

	const activateProject = useCallback((projectId: string) => activate({ projectId }), [activate]);
	const openShell = useCallback(
		(projectId: string, shell: ContinuityShell) => open({ projectId, shell }),
		[open],
	);
	const closeShell = useCallback(
		(projectId: string, shellId: string) => close({ projectId, shellId }),
		[close],
	);
	const moveShell = useCallback(
		(projectId: string, shellId: string, toIndex: number) => move({ projectId, shellId, toIndex }),
		[move],
	);
	const selectShell = useCallback(
		(projectId: string, shellId: string) => select({ projectId, shellId }),
		[select],
	);

	return {
		restored: data?.value ?? EMPTY_CONTINUITY,
		failed: data?.failed ?? false,
		activateProject,
		openShell,
		closeShell,
		moveShell,
		selectShell,
	};
}
