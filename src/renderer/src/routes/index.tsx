import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "@renderer/lib/api";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectRail } from "@renderer/routes/-components/project-rail";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";

export const Route = createFileRoute("/")({ component: Bankai });

function Bankai() {
	const queryClient = useQueryClient();
	const projects = useQuery(orpc.projects.list.queryOptions());
	const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
	const [mountedProjectIds, setMountedProjectIds] = useState<string[]>([]);
	const availableProjects = projects.data || [];
	const selectedId = activeProjectId || availableProjects[0]?.id;

	const handleSelectProject = (projectId: string) => {
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
				handleSelectProject(project.id);
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const mountedIds = selectedId && !mountedProjectIds.includes(selectedId)
		? [...mountedProjectIds, selectedId]
		: mountedProjectIds;

	return (
		<main className="flex h-full bg-surface">
			<ProjectRail
				projects={availableProjects}
				loading={projects.isPending}
				selectedId={selectedId}
				onSelect={handleSelectProject}
				onAdd={() => addProject.mutate({})}
				adding={addProject.isPending}
				addFailed={addProject.isError}
			/>
			<section className="flex min-h-0 min-w-0 flex-1 flex-col">
				{projects.isError && (
					<EmptyState
						mark="!"
						title="Projects unavailable"
						description={String(projects.error)}
						actionLabel="Retry loading"
						onAction={() => projects.refetch()}
					/>
				)}
				{projects.isSuccess && availableProjects.length === 0 && (
					<EmptyState
						mark="›_"
						title="Choose a working directory"
						description="Bankai keeps project shells together in one focused workspace."
						actionLabel="Add first project"
						onAction={() => addProject.mutate({})}
					/>
				)}
				{!projects.isError && availableProjects.filter((project) => mountedIds.includes(project.id)).map((project) => (
					<ProjectWorkspace key={project.id} project={project} active={project.id === selectedId} />
				))}
			</section>
		</main>
	);
}
