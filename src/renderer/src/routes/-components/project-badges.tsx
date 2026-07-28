import type { Project } from "@main/store/projects";

export function ProjectBadges({
	projects,
	openProjectIds,
	chosenProjectIds,
	onToggle,
}: {
	projects: Project[];
	openProjectIds: ReadonlySet<string>;
	chosenProjectIds: ReadonlySet<string>;
	onToggle: (projectId: string) => void;
}) {
	const listed = projects
		.filter((project) => openProjectIds.has(project.id) || chosenProjectIds.has(project.id))
		.sort((left, right) => left.name.localeCompare(right.name));

	if (listed.length < 2) {
		return null;
	}

	return (
		<div
			data-component="project-badges"
			role="group"
			aria-label="Narrow sessions to projects"
			className="badge-strip flex shrink-0 gap-1 overflow-x-auto border-b border-outline px-3 py-1.5"
		>
			{listed.map((project) => {
				const chosen = chosenProjectIds.has(project.id);

				return (
					<button
						key={project.id}
						type="button"
						data-component="project-badge"
						data-project-id={project.id}
						aria-pressed={chosen}
						title={project.path}
						className={`flex h-5 max-w-32 shrink-0 items-center border px-1.5 text-label uppercase ${
							chosen
								? "border-tertiary bg-tertiary text-surface"
								: "border-outline text-secondary hover:border-outline-strong hover:text-primary"
						}`}
						onClick={() => onToggle(project.id)}
					>
						<span className="truncate">{project.name}</span>
					</button>
				);
			})}
		</div>
	);
}
