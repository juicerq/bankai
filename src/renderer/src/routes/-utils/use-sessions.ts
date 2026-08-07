import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import type { ProjectCommand } from "@main/store/project-commands";
import type { ContinuityValue } from "@main/store/continuity";
import { orpc } from "@renderer/lib/api";
import { newId } from "@renderer/lib/id";
import { useShellResidency } from "@renderer/routes/-utils/use-shell-residency";
import { ContinuityReducers, type OpenedShell } from "@shared/continuity-reducers";

const EMPTY_CONTINUITY: ContinuityValue = { workspaces: [] };
const CONTINUITY_KEY = orpc.continuity.get.queryOptions().queryKey;

function newShell(plain?: boolean): OpenedShell {
	if (plain) {
		return { id: newId(), plain };
	}

	return { id: newId() };
}

export function useSessions() {
	const queryClient = useQueryClient();
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
	const shells = useMemo(
		() => continuity.workspaces.flatMap((workspace) => workspace.shells),
		[continuity],
	);
	const residency = useShellResidency({ shells });

	const pendingProjections = useRef(new Set<symbol>());
	const latestProjection = useRef<symbol | null>(null);
	const reconciliationPending = useRef(false);
	const selectBatches = useRef(new Map<string, { pending: number; startedAsleep: boolean; succeeded: boolean }>());

	// The projected value is written before the main process answers, so a
	// gesture repaints in its own commit; the push still overwrites it with the
	// authoritative value a moment later. A failed write restores its snapshot
	// only while no newer projection or push has replaced it.
	const project = useCallback(
		(reduce: (value: ContinuityValue) => ContinuityValue) => {
			const token = Symbol();
			const previous = queryClient.getQueryData<typeof data>(CONTINUITY_KEY);
			const projected = queryClient.setQueryData(CONTINUITY_KEY, {
				value: reduce(previous?.value ?? EMPTY_CONTINUITY),
				failed: previous?.failed ?? false,
			});
			pendingProjections.current.add(token);
			latestProjection.current = token;

			return {
				rollback: () => {
					if (latestProjection.current !== token || queryClient.getQueryData(CONTINUITY_KEY) !== projected) {
						reconciliationPending.current = true;
						return false;
					}

					if (previous) {
						queryClient.setQueryData(CONTINUITY_KEY, previous);
					} else {
						queryClient.removeQueries({ queryKey: CONTINUITY_KEY, exact: true });
					}

					return true;
				},
				settle: () => {
					pendingProjections.current.delete(token);
					if (pendingProjections.current.size > 0 || !reconciliationPending.current) {
						return;
					}

					reconciliationPending.current = false;
					void queryClient.invalidateQueries({ queryKey: CONTINUITY_KEY, exact: true });
				},
			};
		},
		[queryClient],
	);
	const commit = useCallback(
		(
			write: Promise<unknown>,
			projection: ReturnType<typeof project>,
			options?: { onSettled?: () => void; onSuccess?: () => void },
		) => {
			void write
				.then(
					() => options?.onSuccess?.(),
					() => {
						projection.rollback();
					},
				)
				.finally(() => {
					projection.settle();
					options?.onSettled?.();
				});
		},
		[],
	);
	const openConfirmed = useCallback(
		(projectId: string, shell: OpenedShell) => {
			open(
				{ projectId, shell },
				{
					onSuccess: () => {
						const projection = project((value) =>
							ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() })
						);
						projection.settle();
					},
				},
			);
		},
		[open, project],
	);

	const openShell = useCallback(
		(projectId: string, plain?: boolean) => {
			const shell = newShell(plain);

			if (plain) {
				openConfirmed(projectId, shell);
				return;
			}

			const projection = project((value) =>
				ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() })
			);
			commit(openAsync({ projectId, shell }), projection);
		},
		[commit, openAsync, openConfirmed, project],
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

			const projection = project((value) =>
				ContinuityReducers.openShell(value, { projectId, shell, now: Date.now() })
			);
			await openAsync({ projectId, shell })
				.catch((error) => {
					projection.rollback();
					throw error;
				})
				.finally(projection.settle);

			return shell.id;
		},
		[openAsync, project],
	);

	const closeShell = useCallback(
		(projectId: string, shellId: string) => {
			const projection = project((value) =>
				ContinuityReducers.closeShell(value, { projectId, shellId, now: Date.now() })
			);
			commit(close({ projectId, shellId }), projection);
		},
		[close, commit, project],
	);

	const selectShell = useCallback(
		(projectId: string, shellId: string) => {
			const projection = project((value) =>
				ContinuityReducers.selectShell(value, { projectId, shellId, now: Date.now() })
			);
			let batch = selectBatches.current.get(shellId);
			if (!batch) {
				batch = { pending: 0, startedAsleep: residency.asleep.has(shellId), succeeded: false };
				selectBatches.current.set(shellId, batch);
			}

			batch.pending += 1;
			residency.wake(shellId);
			commit(select({ projectId, shellId }), projection, {
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
		[commit, project, residency.asleep, residency.sleep, residency.wake, select],
	);
	const archiveShell = useCallback(
		(projectId: string, shellId: string) => {
			const projection = project((value) =>
				ContinuityReducers.archiveShell(value, { projectId, shellId, now: Date.now() })
			);
			residency.sleep(shellId);
			commit(archive({ projectId, shellId }), projection);
		},
		[archive, commit, project, residency.sleep],
	);

	const unarchiveShell = useCallback(
		(projectId: string, shellId: string) => {
			const projection = project((value) =>
				ContinuityReducers.unarchiveShell(value, { projectId, shellId, now: Date.now() })
			);
			commit(unarchive({ projectId, shellId }), projection);
		},
		[commit, project, unarchive],
	);

	const pinShell = useCallback(
		(projectId: string, shellId: string) => {
			const projection = project((value) =>
				ContinuityReducers.pinShell(value, { projectId, shellId, now: Date.now() })
			);
			commit(pin({ projectId, shellId }), projection);
		},
		[commit, pin, project],
	);

	const unpinShell = useCallback(
		(projectId: string, shellId: string) => {
			const projection = project((value) =>
				ContinuityReducers.unpinShell(value, { projectId, shellId })
			);
			commit(unpin({ projectId, shellId }), projection);
		},
		[commit, project, unpin],
	);

	const renameShell = useCallback(
		(projectId: string, shellId: string, title: string) => {
			const projection = project((value) =>
				ContinuityReducers.renameShell(value, { projectId, shellId, title })
			);
			commit(rename({ projectId, shellId, title }), projection);
		},
		[commit, project, rename],
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
