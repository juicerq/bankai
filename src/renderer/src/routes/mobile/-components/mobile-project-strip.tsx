import type { Project } from "@main/store/projects";

export function MobileProjectStrip({
	projects,
	chosenProjectIds,
	onToggleProject,
}: {
	projects: Project[];
	chosenProjectIds: ReadonlySet<string>;
	onToggleProject: (projectId: string) => void;
}) {
	if (projects.length < 2) {
		return null;
	}

	return (
		<div
			data-component="mobile-project-strip"
			role="group"
			aria-label="Narrow sessions to projects"
			className="flex shrink-0 gap-2 overflow-x-auto border-b border-outline px-4 py-2"
		>
			{projects.map((project) => (
				<button
					key={project.id}
					type="button"
					data-component="mobile-project-badge"
					data-project-id={project.id}
					aria-pressed={chosenProjectIds.has(project.id)}
					className={`max-w-40 shrink-0 truncate border px-2.5 py-2 text-data ${
						chosenProjectIds.has(project.id)
							? "border-tertiary bg-tertiary text-surface"
							: "border-outline text-secondary"
					}`}
					onClick={() => onToggleProject(project.id)}
				>
					{project.name}
				</button>
			))}
		</div>
	);
}
