import { useCallback, useRef, useState } from "react";
import type { ContinuityValue } from "@main/store/continuity";

export interface WorkspaceCommands {
	selectShell: (shellId: string) => void;
	openShell: () => void;
	closeShell: (shellId: string) => void;
}

function seededSelection(continuity: ContinuityValue): Record<string, string> {
	const seeded: Record<string, string> = {};

	for (const workspace of continuity.workspaces) {
		if (workspace.activeShellId) {
			seeded[workspace.projectId] = workspace.activeShellId;
		}
	}

	return seeded;
}

export function useSessionCommands({
	restored,
	onActivateProject,
	onPersistSelection,
	onPersistClose,
}: {
	restored: ContinuityValue;
	onActivateProject: (projectId: string) => void;
	onPersistSelection: (projectId: string, shellId: string) => void;
	onPersistClose: (projectId: string, shellId: string) => void;
}) {
	const [byProject, setByProject] = useState(() => seededSelection(restored));
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

	const noteSelection = useCallback((projectId: string, shellId: string) => {
		setByProject((current) => ({ ...current, [projectId]: shellId }));
	}, []);

	const selectSession = useCallback(
		(projectId: string, shellId: string) => {
			const commands = mounted.current.get(projectId);
			if (commands) {
				commands.selectShell(shellId);
			} else {
				noteSelection(projectId, shellId);
				onPersistSelection(projectId, shellId);
			}

			onActivateProject(projectId);
		},
		[noteSelection, onActivateProject, onPersistSelection],
	);

	const createSession = useCallback(
		(projectId: string) => {
			onActivateProject(projectId);

			const commands = mounted.current.get(projectId);
			if (commands) {
				commands.openShell();
				return;
			}

			queued.current.set(projectId, [
				...(queued.current.get(projectId) ?? []),
				(pending) => pending.openShell(),
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

	return { byProject, registerWorkspace, noteSelection, selectSession, createSession, closeSession };
}
