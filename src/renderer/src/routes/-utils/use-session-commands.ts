import { useCallback, useRef } from "react";

export interface WorkspaceCommands {
	openShell: (plain: boolean) => void;
	closeShell: (shellId: string) => void;
}

export function useSessionCommands({
	onActivateProject,
	onPersistSelection,
	onPersistClose,
}: {
	onActivateProject: (projectId: string) => void;
	onPersistSelection: (projectId: string, shellId: string) => void;
	onPersistClose: (projectId: string, shellId: string) => void;
}) {
	const mounted = useRef(new Map<string, WorkspaceCommands>());
	const queued = useRef(new Map<string, ((commands: WorkspaceCommands) => void)[]>());

	const registerWorkspace = useCallback((projectId: string, commands: WorkspaceCommands) => {
		mounted.current.set(projectId, commands);

		const pending = queued.current.get(projectId) ?? [];
		queued.current.delete(projectId);
		for (const run of pending) {
			run(commands);
		}

		return () => {
			if (mounted.current.get(projectId) === commands) {
				mounted.current.delete(projectId);
			}
		};
	}, []);

	const selectSession = useCallback(
		(projectId: string, shellId: string) => {
			onPersistSelection(projectId, shellId);
			onActivateProject(projectId);
		},
		[onActivateProject, onPersistSelection],
	);

	const createSession = useCallback(
		(projectId: string, plain: boolean) => {
			onActivateProject(projectId);

			const commands = mounted.current.get(projectId);
			if (commands) {
				commands.openShell(plain);
				return;
			}

			queued.current.set(projectId, [
				...(queued.current.get(projectId) ?? []),
				(pending) => pending.openShell(plain),
			]);
		},
		[onActivateProject],
	);

	const closeSession = useCallback(
		(projectId: string, shellId: string) => {
			const commands = mounted.current.get(projectId);
			if (commands) {
				commands.closeShell(shellId);
				return;
			}

			onPersistClose(projectId, shellId);
		},
		[onPersistClose],
	);

	return { registerWorkspace, selectSession, createSession, closeSession };
}
