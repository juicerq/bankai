import type { ContinuityShell } from "@main/store/continuity";
import type { Project } from "@main/store/projects";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { TerminalPane } from "@renderer/routes/-components/terminal-pane";
import { MIN_TERMINAL_WIDTH } from "@renderer/routes/-utils/review-layout";
import { useWorkspaceResidency } from "@renderer/routes/-utils/workspace-context";

export function ProjectWorkspaceShells({
	project,
	shells,
	activeShellId,
	onOpenShell,
	active,
	focusRequest,
	resizeDeferred,
}: {
	project: Project;
	shells: ContinuityShell[];
	activeShellId: string | undefined;
	onOpenShell: (projectId: string) => void;
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
			{shells.every((shell) => residency.asleep.has(shell.id)) && (
				<EmptyState
					mark="›_"
					title="No open shells"
					description={`Start a shell in ${project.name} to continue.`}
					actionLabel="New shell"
					onAction={() => onOpenShell(project.id)}
				/>
			)}
			{shells.map((shell) => (
				<div
					className={`col-start-1 row-start-1 min-h-0 min-w-0 overflow-hidden ${shell.id === activeShellId ? "" : "invisible"}`}
					key={shell.id}
				>
					{!residency.asleep.has(shell.id) && (
						<TerminalPane
							projectId={project.id}
							shellId={shell.id}
							active={active && shell.id === activeShellId}
							focusRequest={focusRequest}
							resizeDeferred={resizeDeferred}
							resumeOnMount={residency.resumable.has(shell.id)}
						/>
					)}
				</div>
			))}
		</div>
	);
}
