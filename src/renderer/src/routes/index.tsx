import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectRail } from "@renderer/routes/-components/project-rail";
import { ProjectRailFrame } from "@renderer/routes/-components/project-rail-frame";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";
import { WindowControls } from "@renderer/routes/-components/window-controls";
import {
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-utils/rail-layout";
import { useAgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import { useBankaiShortcuts } from "@renderer/routes/-utils/use-bankai-shortcuts";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { useLayoutPreferences } from "@renderer/routes/-utils/use-layout-preferences";
import { useWorkspaceActivation } from "@renderer/routes/-utils/use-workspace-activation";

export const Route = createFileRoute("/")({
	component: Bankai,
	loader: () => queryClient.ensureQueryData(orpc.settings.getLayout.queryOptions()).catch(() => null),
});

function Bankai() {
	const reactQueryClient = useQueryClient();
	const projects = useQuery(orpc.projects.list.queryOptions());
	const layout = useLayoutPreferences();
	const [shellFocusRequest, setShellFocusRequest] = useState(0);
	const requestShellFocus = useCallback(() => setShellFocusRequest((current) => current + 1), []);
	const persistFullscreen = useCallback(
		(fullscreen: boolean) => layout.persist({ fullscreen }),
		[layout.persist],
	);
	const [reviewOpen, setReviewOpen] = useState(layout.initial.reviewOpen);
	const handleReviewOpenChange = useCallback(
		(open: boolean) => {
			setReviewOpen(open);
			layout.persist({ reviewOpen: open });
		},
		[layout.persist],
	);
	const [treeOpen, setTreeOpen] = useState(layout.initial.treeOpen);
	const handleTreeOpenChange = useCallback(
		(open: boolean) => {
			setTreeOpen(open);
			layout.persist({ treeOpen: open });
		},
		[layout.persist],
	);
	const projectRail = useFullscreenProjectRail(requestShellFocus, {
		initialFullscreen: layout.initial.fullscreen,
		onFullscreenChange: persistFullscreen,
	});
	const [railWidth, setRailWidth] = useState(layout.initial.railWidth);
	const railFrameRef = useRef<HTMLDivElement>(null);
	const railDivider = useDivider({
		value: railWidth,
		min: MIN_RAIL_WIDTH,
		max: MAX_RAIL_WIDTH,
		sign: 1,
		target: railFrameRef,
		resolve: (proposed) => {
			const { width, snap } = resolveRailWidth(proposed);

			if (projectRail.fullscreen) {
				return {
					vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
					commit: () => {
						projectRail.toggleFullscreen({ animate: false });
						setRailWidth(width);
						layout.persist({ railWidth: width });
					},
				};
			}

			return {
				vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
				commit: snap
					? () => {
						railFrameRef.current?.style.setProperty(RAIL_WIDTH_PROPERTY, `${railWidth}px`);
						projectRail.toggleFullscreen();
					}
					: () => {
						setRailWidth(width);
						layout.persist({ railWidth: width });
					},
			};
		},
	});
	const availableProjects = projects.data || [];
	const activity = useAgentActivities(availableProjects.map((project) => project.id));
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
				await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const openDirectory = useMutation(orpc.projects.openDirectory.mutationOptions());
	const moveProject = useMutation(
		orpc.projects.move.mutationOptions({
			onSuccess: async () => {
				await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const removeProject = useMutation(
		orpc.projects.remove.mutationOptions({
			onSuccess: async (_, input) => {
				dropWorkspace(input.projectId);
				await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
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
			<ProjectRailFrame projectRail={projectRail} divider={railDivider} frameRef={railFrameRef} railWidth={railWidth}>
				<ProjectRail
					projects={availableProjects}
					activity={activity.projects}
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
			<section className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1">
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
						projects={availableProjects}
						shellActivity={activity.shells}
						active={project.id === activeProjectId}
						shellFocusRequest={shellFocusRequest}
						fullscreen={projectRail.fullscreen}
						fullscreenAnimating={projectRail.animating}
						onToggleFullscreen={projectRail.toggleFullscreen}
						initialDiffWidth={layout.initial.diffWidth}
						initialTreeWidth={layout.initial.treeWidth}
						onPersistLayout={layout.persist}
						reviewOpen={reviewOpen}
						onReviewOpenChange={handleReviewOpenChange}
						treeOpen={treeOpen}
						onTreeOpenChange={handleTreeOpenChange}
					/>
				))}
			</section>
		</main>
	);
}
