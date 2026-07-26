import { createContext, type ReactNode, use } from "react";
import type { LayoutSettings } from "@main/store/settings";
import type { AgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import type { WorkspaceCommands } from "@renderer/routes/-utils/use-session-commands";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";

interface WorkspaceControl {
	initialDiffWidth: number;
	initialTreeWidth: number;
	onToggleFullscreen: () => void;
	onPersistLayout: (patch: LayoutSettings) => void;
	onReviewOpenChange: (open: boolean) => void;
	onTreeOpenChange: (open: boolean) => void;
	onShellOpen: (projectId: string, shell: ShellTab) => void;
	onShellClose: (projectId: string, shellId: string) => void;
	onShellSelect: (projectId: string, shellId: string) => void;
	registerWorkspace: (projectId: string, commands: WorkspaceCommands) => () => void;
}

const WorkspaceControlContext = createContext<WorkspaceControl | null>(null);
const WorkspaceActivityContext = createContext<AgentActivities | null>(null);

export function WorkspaceProvider({
	control,
	agents,
	children,
}: {
	control: WorkspaceControl;
	agents: AgentActivities;
	children: ReactNode;
}) {
	return (
		<WorkspaceControlContext value={control}>
			<WorkspaceActivityContext value={agents}>{children}</WorkspaceActivityContext>
		</WorkspaceControlContext>
	);
}

export function useWorkspaceControl() {
	const control = use(WorkspaceControlContext);
	if (!control) {
		throw new Error("useWorkspaceControl needs a WorkspaceProvider above it");
	}

	return control;
}

export function useWorkspaceAgents() {
	const agents = use(WorkspaceActivityContext);
	if (!agents) {
		throw new Error("useWorkspaceAgents needs a WorkspaceProvider above it");
	}

	return agents;
}
