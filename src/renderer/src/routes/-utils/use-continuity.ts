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
	const { mutate: select } = useMutation(orpc.continuity.selectShell.mutationOptions());
	const { mutate: rename } = useMutation(orpc.continuity.renameShell.mutationOptions());
	const { mutate: archive } = useMutation(orpc.continuity.archiveShell.mutationOptions());
	const { mutate: unarchive } = useMutation(orpc.continuity.unarchiveShell.mutationOptions());

	const activateProject = useCallback((projectId: string) => activate({ projectId }), [activate]);
	const openShell = useCallback(
		(projectId: string, shell: Pick<ContinuityShell, "id" | "label">) => open({ projectId, shell }),
		[open],
	);
	const closeShell = useCallback(
		(projectId: string, shellId: string) => close({ projectId, shellId }),
		[close],
	);
	const selectShell = useCallback(
		(projectId: string, shellId: string) => select({ projectId, shellId }),
		[select],
	);

	const renameShell = useCallback(
		(projectId: string, shellId: string, title: string) => rename({ projectId, shellId, title }),
		[rename],
	);

	const archiveShell = useCallback(
		(projectId: string, shellId: string) => archive({ projectId, shellId }),
		[archive],
	);

	const unarchiveShell = useCallback(
		(projectId: string, shellId: string) => unarchive({ projectId, shellId }),
		[unarchive],
	);

	return {
		restored: data?.value ?? EMPTY_CONTINUITY,
		failed: data?.failed ?? false,
		activateProject,
		openShell,
		closeShell,
		selectShell,
		renameShell,
		archiveShell,
		unarchiveShell,
	};
}
