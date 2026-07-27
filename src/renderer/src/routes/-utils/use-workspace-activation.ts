import { useCallback, useRef, useState } from "react";
import type { ContinuityWorkspace } from "@main/store/continuity";

interface ActivationState {
	explicitProjectId: string | null;
	residentProjectIds: string[];
}

interface WorkspaceActivationOptions {
	initialActiveProjectId?: string;
	initialResidentProjectIds?: readonly string[];
	onActivate?: (projectId: string) => void;
}

function appendUnique(ids: string[], id: string | undefined) {
	if (!id || ids.includes(id)) {
		return ids;
	}

	return [...ids, id];
}

export function restoredResidentProjectIds(workspaces: Pick<ContinuityWorkspace, "projectId" | "shells">[]) {
	return workspaces
		.filter((workspace) => workspace.shells.length > 0)
		.map((workspace) => workspace.projectId);
}

export function useWorkspaceActivation(availableProjectIds: readonly string[], options: WorkspaceActivationOptions) {
	const [state, setState] = useState<ActivationState>(() => ({
		explicitProjectId: options.initialActiveProjectId ?? null,
		residentProjectIds: [...(options.initialResidentProjectIds ?? [])],
	}));
	const availableRef = useRef(availableProjectIds);
	availableRef.current = availableProjectIds;
	const onActivateRef = useRef(options.onActivate);
	onActivateRef.current = options.onActivate;

	const activateProject = useCallback((projectId: string) => {
		onActivateRef.current?.(projectId);
		setState((current) => ({
			explicitProjectId: projectId,
			residentProjectIds: appendUnique(
				appendUnique(current.residentProjectIds, current.explicitProjectId ?? availableRef.current[0]),
				projectId,
			),
		}));
	}, []);

	const dropWorkspace = useCallback((projectId: string) => {
		setState((current) => ({
			explicitProjectId: current.explicitProjectId === projectId ? null : current.explicitProjectId,
			residentProjectIds: current.residentProjectIds.filter((id) => id !== projectId),
		}));
	}, []);

	const activeProjectId = state.explicitProjectId ?? availableProjectIds[0];
	const residentIds = appendUnique(state.residentProjectIds, activeProjectId);

	return {
		activeProjectId,
		residentProjectIds: availableProjectIds.filter((id) => residentIds.includes(id)),
		activateProject,
		dropWorkspace,
	};
}
