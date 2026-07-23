import { useCallback, useRef, useState } from "react";

interface ActivationState {
	explicitProjectId: string | null;
	residentProjectIds: string[];
}

function appendUnique(ids: string[], id: string | undefined) {
	if (!id || ids.includes(id)) {
		return ids;
	}

	return [...ids, id];
}

export function useWorkspaceActivation(availableProjectIds: readonly string[]) {
	const [state, setState] = useState<ActivationState>({ explicitProjectId: null, residentProjectIds: [] });
	const availableRef = useRef(availableProjectIds);
	availableRef.current = availableProjectIds;

	const activateProject = useCallback((projectId: string) => {
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
