import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileNewShell } from "@renderer/routes/mobile/-components/mobile-new-shell";
import { MobileProjectStrip } from "@renderer/routes/mobile/-components/mobile-project-strip";
import { MobileSessionCard } from "@renderer/routes/mobile/-components/mobile-session-card";

export function MobileSessionList({
	sessions,
	projects,
	projectActivity,
	chosenProjectIds,
	onToggleProject,
	onOpen,
	onCreate,
}: {
	sessions: SessionRow[];
	projects: Project[];
	projectActivity: ReadonlyMap<string, AgentActivityState>;
	chosenProjectIds: ReadonlySet<string>;
	onToggleProject: (projectId: string) => void;
	onOpen: (shellId: string) => void;
	onCreate: (projectId: string) => Promise<void>;
}) {
	return (
		<div data-component="mobile-session-list" className="flex h-full flex-col bg-surface">
			<header className="flex h-header shrink-0 items-center justify-between border-b border-outline px-4">
				<span className="text-label text-primary">BANKAI</span>
				<div className="flex h-full items-center gap-3">
					<span className="text-label text-secondary">
						SESSIONS <span className="text-outline-strong">{sessions.length}</span>
					</span>
					<MobileNewShell projects={projects} projectActivity={projectActivity} onCreate={onCreate} />
				</div>
			</header>
			<MobileProjectStrip
				projects={projects}
				projectActivity={projectActivity}
				chosenProjectIds={chosenProjectIds}
				onToggleProject={onToggleProject}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{sessions.length === 0
					? (
						<p data-slot="empty" className="px-4 py-8 text-center text-secondary text-support">
							No open sessions.
						</p>
					)
					: sessions.map((row) => <MobileSessionCard key={row.shellId} row={row} onOpen={onOpen} />)}
			</div>
		</div>
	);
}
