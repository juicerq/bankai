import { useCallback, useState } from "react";
import type { ContinuityWorkspace } from "@shared/continuity";

interface WorkspaceActivationOptions {
	activeProjectId?: string;
	initialResidentProjectIds?: readonly string[];
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
	const [residentProjectIds, setResidentProjectIds] = useState<string[]>(() => [
		...(options.initialResidentProjectIds ?? []),
	]);

	const activateProject = useCallback((projectId: string) => {
		setResidentProjectIds((current) => appendUnique(current, projectId));
	}, []);

	const dropWorkspace = useCallback((projectId: string) => {
		setResidentProjectIds((current) => current.filter((id) => id !== projectId));
	}, []);

	const activeProjectId = options.activeProjectId ?? availableProjectIds[0];
	const residentIds = appendUnique(residentProjectIds, activeProjectId);

	return {
		activeProjectId,
		residentProjectIds: availableProjectIds.filter((id) => residentIds.includes(id)),
		activateProject,
		dropWorkspace,
	};
}
