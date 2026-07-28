import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { ContinuityShell, ContinuityValue } from "@main/store/continuity";
import { orpc } from "@renderer/lib/api";
import { useShellResidency } from "@renderer/routes/-utils/use-shell-residency";
import { ContinuityReducers } from "@shared/continuity-reducers";

const EMPTY_CONTINUITY: ContinuityValue = { workspaces: [] };
const CONTINUITY_KEY = orpc.continuity.get.queryOptions().queryKey;

function newShell(plain?: boolean): Pick<ContinuityShell, "id" | "plain"> {
	if (plain) {
		return { id: crypto.randomUUID(), plain };
	}

	return { id: crypto.randomUUID() };
}

export function useSessions() {
	const queryClient = useQueryClient();
	const { data } = useQuery(orpc.continuity.get.queryOptions());
	const { mutate: open, mutateAsync: openAsync } = useMutation(orpc.continuity.openShell.mutationOptions());
	const { mutate: close } = useMutation(orpc.continuity.closeShell.mutationOptions());
	const { mutate: select } = useMutation(orpc.continuity.selectShell.mutationOptions());
	const { mutate: rename } = useMutation(orpc.continuity.renameShell.mutationOptions());
	const { mutate: archive } = useMutation(orpc.continuity.archiveShell.mutationOptions());
	const { mutate: unarchive } = useMutation(orpc.continuity.unarchiveShell.mutationOptions());
	const continuity = data?.value ?? EMPTY_CONTINUITY;
	const shells = useMemo(
		() => continuity.workspaces.flatMap((workspace) => workspace.shells),
		[continuity],
	);
	const residency = useShellResidency({ shells });

	// The projected value is written before the main process answers, so a
	// gesture repaints in its own commit; the push still overwrites it with the
	// authoritative value a moment later.
	const project = useCallback(
		(reduce: (value: ContinuityValue) => ContinuityValue) => {
			queryClient.setQueryData(CONTINUITY_KEY, (previous) => ({
				value: reduce(previous?.value ?? EMPTY_CONTINUITY),
				failed: previous?.failed ?? false,
			}));
		},
		[queryClient],
	);

	const openShell = useCallback(
		(projectId: string, plain?: boolean) => {
			const shell = newShell(plain);

			project((value) => ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() }));
			open({ projectId, shell });
		},
		[open, project],
	);

	const openShellAsync = useCallback(
		async (projectId: string) => {
			const shell = newShell();

			project((value) => ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() }));
			await openAsync({ projectId, shell });

			return shell.id;
		},
		[openAsync, project],
	);

	const closeShell = useCallback(
		(projectId: string, shellId: string) => {
			project((value) => ContinuityReducers.closeShell(value, { projectId, shellId, now: Date.now() }));
			close({ projectId, shellId });
		},
		[close, project],
	);

	const selectShell = useCallback(
		(projectId: string, shellId: string) => {
			project((value) => ContinuityReducers.selectShell(value, { projectId, shellId, now: Date.now() }));
			residency.wake(shellId);
			select({ projectId, shellId });
		},
		[project, residency.wake, select],
	);

	const archiveShell = useCallback(
		(projectId: string, shellId: string) => {
			project((value) => ContinuityReducers.archiveShell(value, { projectId, shellId, now: Date.now() }));
			residency.sleep(shellId);
			archive({ projectId, shellId });
		},
		[archive, project, residency.sleep],
	);

	const unarchiveShell = useCallback(
		(projectId: string, shellId: string) => {
			project((value) => ContinuityReducers.unarchiveShell(value, { projectId, shellId, now: Date.now() }));
			unarchive({ projectId, shellId });
		},
		[project, unarchive],
	);

	const renameShell = useCallback(
		(projectId: string, shellId: string, title: string) => {
			project((value) => ContinuityReducers.renameShell(value, { projectId, shellId, title }));
			rename({ projectId, shellId, title });
		},
		[project, rename],
	);

	return {
		continuity,
		failed: data?.failed ?? false,
		residency,
		openShell,
		openShellAsync,
		closeShell,
		selectShell,
		archiveShell,
		unarchiveShell,
		renameShell,
	};
}
