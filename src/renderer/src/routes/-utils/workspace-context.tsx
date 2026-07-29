import { createContext, type FocusEvent, type ReactNode, use } from "react";
import type { LayoutSettings } from "@main/store/settings";
import type { AgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import type { ShellResidency } from "@renderer/routes/-utils/use-shell-residency";

interface WorkspaceControl {
	initialDiffWidth: number;
	initialTreeWidth: number;
	onToggleFullscreen: () => void;
	onOpenSettings: () => void;
	onOpenCommands: () => void;
	onPersistLayout: (patch: LayoutSettings) => void;
	onReviewOpenChange: (open: boolean) => void;
	onReviewExpandedChange: (expanded: boolean) => void;
	onTreeOpenChange: (open: boolean) => void;
	onRequestShell: (plain: boolean) => void;
}

interface WorkspaceTopBand {
	revealed: boolean;
	onFocus: () => void;
	onBlur: (event: FocusEvent<HTMLElement>) => void;
}

const WorkspaceControlContext = createContext<WorkspaceControl | null>(null);
const WorkspaceActivityContext = createContext<AgentActivities | null>(null);
const WorkspaceResidencyContext = createContext<ShellResidency | null>(null);
const WorkspaceTopBandContext = createContext<WorkspaceTopBand | null>(null);

export function WorkspaceProvider({
	control,
	agents,
	residency,
	topBand,
	children,
}: {
	control: WorkspaceControl;
	agents: AgentActivities;
	residency: ShellResidency;
	topBand: WorkspaceTopBand;
	children: ReactNode;
}) {
	return (
		<WorkspaceControlContext value={control}>
			<WorkspaceActivityContext value={agents}>
				<WorkspaceResidencyContext value={residency}>
					<WorkspaceTopBandContext value={topBand}>{children}</WorkspaceTopBandContext>
				</WorkspaceResidencyContext>
			</WorkspaceActivityContext>
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

export function useWorkspaceTopBand() {
	const topBand = use(WorkspaceTopBandContext);
	if (!topBand) {
		throw new Error("useWorkspaceTopBand needs a WorkspaceProvider above it");
	}

	return topBand;
}

export function useWorkspaceResidency() {
	const residency = use(WorkspaceResidencyContext);
	if (!residency) {
		throw new Error("useWorkspaceResidency needs a WorkspaceProvider above it");
	}

	return residency;
}
