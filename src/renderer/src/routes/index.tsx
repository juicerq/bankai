import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "@renderer/lib/api";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";

export const Route = createFileRoute("/")({ component: Bankai });

function Bankai() {
	const queryClient = useQueryClient();
	const projects = useQuery(orpc.projects.list.queryOptions());
	const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
	const [mountedProjectIds, setMountedProjectIds] = useState<string[]>([]);
	const availableProjects = projects.data || [];
	const selectedId = activeProjectId || availableProjects[0]?.id;

	const activateProject = (projectId: string) => {
		setMountedProjectIds((current) => {
			const retained = selectedId && !current.includes(selectedId) ? [...current, selectedId] : current;
			return retained.includes(projectId) ? retained : [...retained, projectId];
		});
		setActiveProjectId(projectId);
	};

	const addProject = useMutation(
		orpc.projects.chooseDirectory.mutationOptions({
			onSuccess: async (project) => {
				if (!project) {
					return;
				}
				activateProject(project.id);
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const mountedIds = selectedId && !mountedProjectIds.includes(selectedId)
		? [...mountedProjectIds, selectedId]
		: mountedProjectIds;

	return (
		<main className="app-shell">
			<aside className="project-rail">
				<header className="brand"><span className="brand-mark">卍</span><span>BANKAI</span></header>
				<div className="rail-label">Projects</div>
				<nav className="project-list" aria-label="Projects">
					{projects.isPending && <div className="rail-note">Loading workspace...</div>}
					{availableProjects.map((project) => (
						<button type="button" key={project.id} aria-current={selectedId === project.id ? "page" : undefined} aria-pressed={selectedId === project.id} className={selectedId === project.id ? "project-link active" : "project-link"} onClick={() => activateProject(project.id)}>
							<span className="project-glyph">{project.name.slice(0, 1).toUpperCase()}</span>
							<span><strong>{project.name}</strong><small>{project.path}</small></span>
						</button>
					))}
				</nav>
				<button type="button" className="add-project" disabled={addProject.isPending} onClick={() => addProject.mutate({})}>
					<span>+</span>{addProject.isPending && "Opening..."}{!addProject.isPending && "Add project"}
				</button>
				{addProject.isError && <div className="rail-error">Picker failed. <button type="button" onClick={() => addProject.mutate({})}>Retry</button></div>}
				<footer className="rail-footer"><span className="connection-dot" /> Local sessions</footer>
			</aside>
			<section className="workspace-stack">
				{projects.isError && (
					<div className="welcome"><span className="welcome-mark">!</span><h1>Projects unavailable</h1><p>{String(projects.error)}</p><button type="button" onClick={() => projects.refetch()}>Retry loading</button></div>
				)}
				{projects.isSuccess && availableProjects.length === 0 && (
					<div className="welcome"><span className="welcome-mark">›_</span><h1>Choose a working directory</h1><p>Bankai keeps project shells together in one focused workspace.</p><button type="button" onClick={() => addProject.mutate({})}>Add first project</button></div>
				)}
				{!projects.isError && availableProjects.filter((project) => mountedIds.includes(project.id)).map((project) => (
					<ProjectWorkspace key={project.id} project={project} active={project.id === selectedId} />
				))}
			</section>
		</main>
	);
}
