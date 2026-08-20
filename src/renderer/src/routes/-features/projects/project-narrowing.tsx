import type { Project } from "@shared/projects";
import type { ProjectMark, ProjectMarks } from "@renderer/routes/-features/projects/use-project-narrowing";

const MARK_CLASS: Record<ProjectMark, string> = {
	chosen: "bg-surface-active text-primary",
	excluded: "text-outline-strong line-through",
};

export function ProjectNarrowing({
	projects,
	openProjectIds,
	marks,
	onToggle,
	onExclude,
}: {
	projects: Project[];
	openProjectIds: ReadonlySet<string>;
	marks: ProjectMarks;
	onToggle: (projectId: string) => void;
	onExclude: (projectId: string) => void;
}) {
	const listed = projects
		.filter((project) => openProjectIds.has(project.id) || marks.has(project.id))
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
				const mark = marks.get(project.id);

				return (
					<button
						key={project.id}
						type="button"
						data-component="project-choice"
						data-project-id={project.id}
						data-mark={mark}
						aria-pressed={mark === "chosen"}
						title={`${project.path} — right-click hides this project`}
						className={`flex h-full max-w-40 shrink-0 items-center border-r border-outline px-3 text-data focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
							mark ? MARK_CLASS[mark] : "text-secondary hover:bg-surface-hover hover:text-primary"
						}`}
						onClick={() => onToggle(project.id)}
						onContextMenu={(event) => {
							event.preventDefault();
							onExclude(project.id);
						}}
					>
						<span className="truncate">{project.name}</span>
					</button>
				);
			})}
		</div>
	);
}
