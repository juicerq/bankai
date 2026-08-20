import type { Project } from "@shared/projects";
import type { ProjectMarks } from "@renderer/routes/-features/projects/use-project-narrowing";

export function MobileProjectStrip({
	projects,
	projectMarks,
	onToggleProject,
}: {
	projects: Project[];
	projectMarks: ProjectMarks;
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
					aria-pressed={projectMarks.get(project.id) === "chosen"}
					className={`max-w-40 shrink-0 truncate border px-2.5 py-2 text-data ${
						projectMarks.get(project.id) === "chosen"
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
