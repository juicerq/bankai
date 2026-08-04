import type { Project } from "@main/store/projects";

export function ProjectNarrowing({
	projects,
	openProjectIds,
	chosenProjectIds,
	onToggle,
	onExclude,
}: {
	projects: Project[];
	openProjectIds: ReadonlySet<string>;
	chosenProjectIds: ReadonlySet<string>;
	onToggle: (projectId: string) => void;
	onExclude: (projectId: string, listedIds: readonly string[]) => void;
}) {
	const listed = projects
		.filter((project) => openProjectIds.has(project.id) || chosenProjectIds.has(project.id))
		.sort((left, right) => left.name.localeCompare(right.name));

	if (listed.length < 2) {
		return null;
	}

	return (
		<div
			data-component="project-narrowing"
			role="group"
			aria-label="Narrow sessions to projects"
			className="flex h-7 shrink-0 overflow-x-auto border-b border-outline"
		>
			{listed.map((project) => {
				const chosen = chosenProjectIds.has(project.id);

				return (
					<button
						key={project.id}
						type="button"
						data-component="project-choice"
						data-project-id={project.id}
						aria-pressed={chosen}
						title={project.path}
						className={`flex h-full max-w-40 shrink-0 items-center border-r border-outline px-3 text-data focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
							chosen
								? "bg-surface-active text-primary"
								: "text-secondary hover:bg-surface-hover hover:text-primary"
						}`}
						onClick={() => onToggle(project.id)}
						onContextMenu={(event) => {
							event.preventDefault();
							onExclude(project.id, listed.map((listedProject) => listedProject.id));
						}}
					>
						<span className="truncate">{project.name}</span>
					</button>
				);
			})}
		</div>
	);
}
