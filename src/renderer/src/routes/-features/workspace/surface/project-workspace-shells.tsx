import type { ContinuityShell } from "@shared/continuity";
import type { Project } from "@shared/projects";
import { EmptyState } from "@renderer/routes/-features/app/status/empty-state";
import { TerminalPane } from "@renderer/routes/-features/terminal/terminal-pane";
import { MIN_TERMINAL_WIDTH } from "@renderer/routes/-features/review/panel/review-layout";
import { useWorkspaceResidency } from "@renderer/routes/-features/workspace/layout/workspace-context";

export function ProjectWorkspaceShells({
	project,
	shells,
	activeShellId,
	onRequestShell,
	active,
	focusRequest,
	resizeDeferred,
	serviceLogOpen,
}: {
	project: Project;
	shells: ContinuityShell[];
	activeShellId: string | undefined;
	onRequestShell: (plain: boolean) => void;
	active: boolean;
	focusRequest: number;
	resizeDeferred: boolean;
	serviceLogOpen: boolean;
}) {
	const residency = useWorkspaceResidency();

	return (
		<div
			style={{ minWidth: MIN_TERMINAL_WIDTH, contain: "paint" }}
			className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden bg-surface-sunken"
		>
			{!serviceLogOpen && shells.every((shell) => residency.asleep.has(shell.id)) && (
				<EmptyState
					mark="›_"
					title="No open shells"
					description="Start a shell to continue."
					actionLabel="New shell"
					onAction={() => onRequestShell(false)}
				/>
			)}
			{shells.filter((shell) => !residency.asleep.has(shell.id)).map((shell) => (
				<div
					className={`col-start-1 row-start-1 min-h-0 min-w-0 overflow-hidden ${
						shell.id === activeShellId && !serviceLogOpen ? "" : "invisible"
					}`}
					key={shell.id}
				>
					<TerminalPane
						projectId={project.id}
						shellId={shell.id}
						active={active && shell.id === activeShellId && !serviceLogOpen}
						focusRequest={focusRequest}
						resizeDeferred={resizeDeferred}
						resumeOnMount={residency.resumable.has(shell.id)}
					/>
				</div>
			))}
		</div>
	);
}
