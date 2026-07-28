import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-utils/agent-activity";

export function MobileProjectStrip({
	projects,
	projectActivity,
	chosenProjectIds,
	onToggleProject,
}: {
	projects: Project[];
	projectActivity: ReadonlyMap<string, AgentActivityState>;
	chosenProjectIds: ReadonlySet<string>;
	onToggleProject: (projectId: string) => void;
}) {
	if (projects.length < 2) {
		return null;
	}

	const sorted = [...projects].sort((left, right) => left.name.localeCompare(right.name));

	return (
		<div
			data-component="mobile-project-strip"
			role="group"
			aria-label="Narrow sessions to projects"
			className="flex shrink-0 gap-2 overflow-x-auto border-b border-outline px-4 py-2"
		>
			{sorted.map((project) => {
				const chosen = chosenProjectIds.has(project.id);
				const activity = projectActivity.get(project.id);

				return (
					<button
						key={project.id}
						type="button"
						data-component="mobile-project-badge"
						data-project-id={project.id}
						data-activity={activity}
						aria-pressed={chosen}
						className={`flex max-w-40 shrink-0 items-center gap-1.5 border px-2.5 py-2 text-data ${
							chosen ? "border-tertiary bg-tertiary text-surface" : "border-outline text-secondary"
						}`}
						onClick={() => onToggleProject(project.id)}
					>
						<span
							data-slot="project-dot"
							aria-hidden="true"
							className={`size-1.5 shrink-0 rounded-full ${dotClass({ activity, chosen })}`}
						/>
						<span className="truncate">{project.name}</span>
					</button>
				);
			})}
		</div>
	);
}

function dotClass({ activity, chosen }: { activity: AgentActivityState | undefined; chosen: boolean }): string {
	if (chosen) {
		return "bg-surface";
	}
	if (!activity) {
		return "bg-outline-strong";
	}

	return ACTIVITY_DOT_CLASS[activity];
}
