import type { Project } from "@main/store/projects";

export function ProjectRail({
	projects,
	loading,
	selectedId,
	onSelect,
	onAdd,
	adding,
	addFailed,
}: {
	projects: Project[];
	loading: boolean;
	selectedId: string | undefined;
	onSelect: (projectId: string) => void;
	onAdd: () => void;
	adding: boolean;
	addFailed: boolean;
}) {
	return (
		<aside className="flex min-h-0 w-rail shrink-0 flex-col border-r border-outline bg-surface-raised">
			<h1 className="m-0 flex h-header shrink-0 items-center gap-2 border-b border-outline px-3 text-label">
				<span className="text-tertiary text-title leading-none">卍</span>
				<span>BANKAI</span>
			</h1>
			<div className="border-outline border-y px-3 py-2 text-label text-secondary">Projects</div>
			<nav className="min-h-0 flex-1 overflow-auto" aria-label="Projects">
				{loading && <div className="p-3 text-data text-secondary">Loading workspace...</div>}
				{projects.map((project) => (
					<ProjectRailItem
						key={project.id}
						project={project}
						selected={selectedId === project.id}
						onSelect={onSelect}
					/>
				))}
			</nav>
			<button
				type="button"
				className="mx-3 my-2 border border-outline-strong border-dashed p-2 text-left text-secondary text-support hover:border-primary hover:text-primary"
				disabled={adding}
				onClick={onAdd}
			>
				<span className="mr-2">+</span>
				{adding && "Opening..."}
				{!adding && "Add project"}
			</button>
			{addFailed && (
				<div className="px-3 pb-2 text-data text-removed">
					Picker failed.{" "}
					<button type="button" className="text-primary underline" onClick={onAdd}>
						Retry
					</button>
				</div>
			)}
			<footer className="mt-auto flex shrink-0 items-center gap-2 border-outline border-t px-3 py-3 text-data text-secondary">
				<span className="size-2 shrink-0 rounded-full bg-tertiary" /> Local sessions
			</footer>
		</aside>
	);
}

function ProjectRailItem({
	project,
	selected,
	onSelect,
}: {
	project: Project;
	selected: boolean;
	onSelect: (projectId: string) => void;
}) {
	return (
		<button
			type="button"
			aria-current={selected ? "page" : undefined}
			aria-pressed={selected}
			className={`flex w-full items-center gap-3 border-t border-l-2 border-t-outline p-3 text-left first:border-t-transparent hover:bg-surface-hover ${
				selected ? "border-l-tertiary bg-surface-active" : "border-l-transparent"
			}`}
			onClick={() => onSelect(project.id)}
		>
			<span
				className={`grid size-6 shrink-0 place-items-center border text-label ${
					selected ? "border-tertiary text-tertiary" : "border-outline text-secondary"
				}`}
			>
				{project.name.slice(0, 1).toUpperCase()}
			</span>
			<span className="min-w-0">
				<span className="block truncate text-body text-primary">{project.name}</span>
				<span className="block truncate text-data text-secondary">{project.path}</span>
			</span>
		</button>
	);
}
