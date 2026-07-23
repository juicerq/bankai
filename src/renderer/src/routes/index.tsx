import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { orpc } from "@renderer/lib/api";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectRail } from "@renderer/routes/-components/project-rail";
import { ProjectRailFrame } from "@renderer/routes/-components/project-rail-frame";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";
import { WindowControls } from "@renderer/routes/-components/window-controls";
import { useBankaiShortcuts } from "@renderer/routes/-utils/use-bankai-shortcuts";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { useWorkspaceActivation } from "@renderer/routes/-utils/use-workspace-activation";

export const Route = createFileRoute("/")({ component: Bankai });

function Bankai() {
	const queryClient = useQueryClient();
	const projects = useQuery(orpc.projects.list.queryOptions());
	const [shellFocusRequest, setShellFocusRequest] = useState(0);
	const requestShellFocus = useCallback(() => setShellFocusRequest((current) => current + 1), []);
	const projectRail = useFullscreenProjectRail(requestShellFocus);
	const availableProjects = projects.data || [];
	const { activeProjectId, residentProjectIds, activateProject, dropWorkspace } = useWorkspaceActivation(
		availableProjects.map((project) => project.id),
	);
	const registerShortcuts = useBankaiShortcuts({
		projects: availableProjects,
		onActivateProject: activateProject,
		onToggleFullscreen: projectRail.toggleFullscreen,
	});

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
	const openDirectory = useMutation(orpc.projects.openDirectory.mutationOptions());
	const moveProject = useMutation(
		orpc.projects.move.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const removeProject = useMutation(
		orpc.projects.remove.mutationOptions({
			onSuccess: async (_, input) => {
				dropWorkspace(input.projectId);
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const handleAddProject = () => {
		projectRail.setPickerActive(true);
		addProject.mutate({}, {
			onSettled: () => projectRail.setPickerActive(false),
		});
	};

	return (
		<main ref={registerShortcuts} className="relative flex h-full bg-surface">
			<WindowControls />
			<ProjectRailFrame projectRail={projectRail}>
				<ProjectRail
					projects={availableProjects}
					loading={projects.isPending}
					selectedId={activeProjectId}
					onSelect={activateProject}
					onAdd={handleAddProject}
					onOpenDirectory={(projectId) => openDirectory.mutate({ projectId })}
					onRemove={(projectId) => removeProject.mutate({ projectId })}
					onMove={moveProject.mutate}
					adding={addProject.isPending}
					addFailed={addProject.isError}
					onMenuOpenChange={projectRail.setMenuOpen}
					onDragActiveChange={projectRail.setDragging}
				/>
			</ProjectRailFrame>
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
						onAction={handleAddProject}
					/>
				)}
				{!projects.isError && availableProjects.filter((project) => residentProjectIds.includes(project.id)).map((project) => (
					<ProjectWorkspace
						key={project.id}
						project={project}
						active={project.id === activeProjectId}
						shellFocusRequest={shellFocusRequest}
						fullscreen={projectRail.fullscreen}
						fullscreenAnimating={projectRail.animating}
						onToggleFullscreen={projectRail.toggleFullscreen}
					/>
				))}
			</section>
		</main>
	);
}
