import type { Project } from "@main/store/projects";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { TerminalPane } from "@renderer/routes/-components/terminal-pane";
import { MIN_TERMINAL_WIDTH } from "@renderer/routes/-utils/review-layout";
import type { useShellTabs } from "@renderer/routes/-utils/use-shell-tabs";
import { useWorkspaceResidency } from "@renderer/routes/-utils/workspace-context";

export function ProjectWorkspaceShells({
	project,
	shells,
	active,
	focusRequest,
	resizeDeferred,
}: {
	project: Project;
	shells: ReturnType<typeof useShellTabs>;
	active: boolean;
	focusRequest: number;
	resizeDeferred: boolean;
}) {
	const residency = useWorkspaceResidency();

	return (
		<div
			style={{ minWidth: MIN_TERMINAL_WIDTH, contain: "paint" }}
			className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden bg-surface-sunken"
		>
			{!shells.tabs.some((tab) => residency.resident.has(tab.id)) && (
				<EmptyState
					mark="›_"
					title="No open shells"
					description={`Start a shell in ${project.name} to continue.`}
					actionLabel="New shell"
					onAction={() => shells.openTab(false)}
				/>
			)}
			{shells.tabs.map((tab) => (
				<div
					className={`col-start-1 row-start-1 min-h-0 min-w-0 overflow-hidden ${tab.id === shells.activeTabId ? "" : "invisible"}`}
					key={tab.id}
				>
					{residency.resident.has(tab.id) && (
						<TerminalPane
							projectId={project.id}
							shellId={tab.id}
							active={active && tab.id === shells.activeTabId}
							focusRequest={focusRequest}
							resizeDeferred={resizeDeferred}
							resumeOnMount={residency.resumable.has(tab.id)}
						/>
					)}
				</div>
			))}
		</div>
	);
}
