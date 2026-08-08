import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { ProjectCommand } from "@shared/project-commands";
import type { ContinuityValue } from "@shared/continuity";
import { orpc } from "@renderer/lib/api";
import { newId } from "@renderer/lib/id";
import { useContinuityProjection } from "@renderer/routes/-features/sessions/lifecycle/use-continuity-projection";
import { useShellResidency } from "@renderer/routes/-features/sessions/lifecycle/use-shell-residency";
import { ContinuityReducers, type OpenedShell } from "@shared/continuity-reducers";

const EMPTY_CONTINUITY: ContinuityValue = { workspaces: [] };
function newShell(plain?: boolean): OpenedShell {
	if (plain) {
		return { id: newId(), plain };
	}

	return { id: newId() };
}

export function useSessions() {
	const { data } = useQuery(orpc.continuity.get.queryOptions());
	const { mutate: open, mutateAsync: openAsync } = useMutation(orpc.continuity.openShell.mutationOptions());
	const { mutateAsync: close } = useMutation(orpc.continuity.closeShell.mutationOptions());
	const { mutateAsync: select } = useMutation(orpc.continuity.selectShell.mutationOptions());
	const { mutateAsync: rename } = useMutation(orpc.continuity.renameShell.mutationOptions());
	const { mutateAsync: archive } = useMutation(orpc.continuity.archiveShell.mutationOptions());
	const { mutateAsync: unarchive } = useMutation(orpc.continuity.unarchiveShell.mutationOptions());
	const { mutateAsync: pin } = useMutation(orpc.continuity.pinShell.mutationOptions());
	const { mutateAsync: unpin } = useMutation(orpc.continuity.unpinShell.mutationOptions());
	const continuity = data?.value ?? EMPTY_CONTINUITY;
	const residency = useShellResidency({
		shells: continuity.workspaces.flatMap((workspace) => workspace.shells),
	});
	const projection = useContinuityProjection();
	const selectBatches = useRef(new Map<string, { pending: number; startedAsleep: boolean; succeeded: boolean }>());
	const openConfirmed = useCallback(
		(projectId: string, shell: OpenedShell) => {
			open(
				{ projectId, shell },
				{
					onSuccess: () => {
						projection.applyConfirmed((value) =>
							ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() })
						);
					},
				},
			);
		},
		[open, projection.applyConfirmed],
	);

	const openShell = useCallback(
		(projectId: string, plain?: boolean) => {
			const shell = newShell(plain);

			if (plain) {
				openConfirmed(projectId, shell);
				return;
			}

			projection.commit({
				reduce: (value) => ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() }),
				write: () => openAsync({ projectId, shell }),
			});
		},
		[openAsync, openConfirmed, projection.commit],
	);

	// The command rides on the shell record instead of being typed into a live
	// one: the shell launches it, so nothing has to wait for a PTY to attach and
	// no agent is left reading the command as a prompt.
	const openCommandShell = useCallback(
		(projectId: string, command: Pick<ProjectCommand, "label" | "command">) => {
			const shell: OpenedShell = {
				id: newId(),
				plain: true,
				launch: command.command,
				title: command.label,
				titleSource: "user",
			};

			openConfirmed(projectId, shell);
		},
		[openConfirmed],
	);

	const openShellAsync = useCallback(
		async (projectId: string) => {
			const shell = newShell();

			await projection.commitAsync({
				reduce: (value) => ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() }),
				write: () => openAsync({ projectId, shell }),
			});

			return shell.id;
		},
		[openAsync, projection.commitAsync],
	);

	const closeShell = useCallback(
		(projectId: string, shellId: string) => {
			projection.commit({
				reduce: (value) => ContinuityReducers.closeShell(value, { projectId, shellId, now: Date.now() }),
				write: () => close({ projectId, shellId }),
			});
		},
		[close, projection.commit],
	);

	const selectShell = useCallback(
		(projectId: string, shellId: string) => {
			let batch = selectBatches.current.get(shellId);
			if (!batch) {
				batch = { pending: 0, startedAsleep: residency.asleep.has(shellId), succeeded: false };
				selectBatches.current.set(shellId, batch);
			}

			batch.pending += 1;
			residency.wake(shellId);
			projection.commit({
				reduce: (value) => ContinuityReducers.selectShell(value, { projectId, shellId, now: Date.now() }),
				write: () => select({ projectId, shellId }),
				onSettled: () => {
					batch.pending -= 1;
					if (batch.pending > 0) {
						return;
					}

					selectBatches.current.delete(shellId);
					if (batch.startedAsleep && !batch.succeeded) {
						residency.sleep(shellId);
					}
				},
				onSuccess: () => {
					batch.succeeded = true;
				},
			});
		},
		[projection.commit, residency.asleep, residency.sleep, residency.wake, select],
	);
	const archiveShell = useCallback(
		(projectId: string, shellId: string) => {
			residency.sleep(shellId);
			projection.commit({
				reduce: (value) => ContinuityReducers.archiveShell(value, { projectId, shellId, now: Date.now() }),
				write: () => archive({ projectId, shellId }),
			});
		},
		[archive, projection.commit, residency.sleep],
	);

	const unarchiveShell = useCallback(
		(projectId: string, shellId: string) => {
			projection.commit({
				reduce: (value) => ContinuityReducers.unarchiveShell(value, { projectId, shellId, now: Date.now() }),
				write: () => unarchive({ projectId, shellId }),
			});
		},
		[projection.commit, unarchive],
	);

	const pinShell = useCallback(
		(projectId: string, shellId: string) => {
			projection.commit({
				reduce: (value) => ContinuityReducers.pinShell(value, { projectId, shellId, now: Date.now() }),
				write: () => pin({ projectId, shellId }),
			});
		},
		[pin, projection.commit],
	);

	const unpinShell = useCallback(
		(projectId: string, shellId: string) => {
			projection.commit({
				reduce: (value) => ContinuityReducers.unpinShell(value, { projectId, shellId }),
				write: () => unpin({ projectId, shellId }),
			});
		},
		[projection.commit, unpin],
	);

	const renameShell = useCallback(
		(projectId: string, shellId: string, title: string) => {
			projection.commit({
				reduce: (value) => ContinuityReducers.renameShell(value, { projectId, shellId, title }),
				write: () => rename({ projectId, shellId, title }),
			});
		},
		[projection.commit, rename],
	);

	return {
		continuity,
		failed: data?.failed ?? false,
		residency,
		openShell,
		openCommandShell,
		openShellAsync,
		closeShell,
		selectShell,
		archiveShell,
		unarchiveShell,
		pinShell,
		unpinShell,
		renameShell,
	};
}
