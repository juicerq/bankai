import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";
import { ContinuityFailedNotice } from "@renderer/routes/-components/continuity-failed-notice";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectPicker } from "@renderer/routes/-components/project-picker";
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
import { useContinuity } from "@renderer/routes/-utils/use-continuity";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { useLayoutPreferences } from "@renderer/routes/-utils/use-layout-preferences";
import { useWorkspaceActivation } from "@renderer/routes/-utils/use-workspace-activation";
import { WorkspaceProvider } from "@renderer/routes/-utils/workspace-context";

export const Route = createFileRoute("/")({
	component: Bankai,
	loader: () =>
		Promise.all([
			queryClient.ensureQueryData(orpc.settings.getLayout.queryOptions()).catch(() => null),
			queryClient.ensureQueryData(orpc.continuity.get.queryOptions()).catch(() => null),
		]),
});

function Bankai() {
	const reactQueryClient = useQueryClient();
	const projects = useQuery(orpc.projects.list.queryOptions());
	const layout = useLayoutPreferences();
	const continuity = useContinuity();
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
			const { width, intent } = resolveRailWidth(proposed);

			if (intent === "focus" && !projectRail.fullscreen) {
				return {
					vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
					intent,
					commit: () => {
						railFrameRef.current?.style.setProperty(RAIL_WIDTH_PROPERTY, `${railWidth}px`);
						projectRail.toggleFullscreen();
					},
				};
			}

			return {
				vars: [{ property: RAIL_WIDTH_PROPERTY, value: width }],
				intent,
				commit: () => {
					if (projectRail.fullscreen) {
						projectRail.toggleFullscreen({ animate: false });
					}

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
		{
			initialActiveProjectId: continuity.restored.activeProjectId,
			initialResidentProjectIds: continuity.restored.workspaces.map((workspace) => workspace.projectId),
			onActivate: continuity.activateProject,
		},
	);
	const control = useMemo(
		() => ({
			projects: availableProjects,
			initialDiffWidth: layout.initial.diffWidth,
			initialTreeWidth: layout.initial.treeWidth,
			onToggleFullscreen: projectRail.toggleFullscreen,
			onPersistLayout: layout.persist,
			onReviewOpenChange: handleReviewOpenChange,
			onTreeOpenChange: handleTreeOpenChange,
			onShellOpen: continuity.openShell,
			onShellClose: continuity.closeShell,
			onShellMove: continuity.moveShell,
			onShellSelect: continuity.selectShell,
		}),
		[
			availableProjects,
			layout.initial.diffWidth,
			layout.initial.treeWidth,
			layout.persist,
			projectRail.toggleFullscreen,
			handleReviewOpenChange,
			handleTreeOpenChange,
			continuity.openShell,
			continuity.closeShell,
			continuity.moveShell,
			continuity.selectShell,
		],
	);
	const registerShortcuts = useBankaiShortcuts({
		projects: availableProjects,
		onActivateProject: activateProject,
		onToggleFullscreen: projectRail.toggleFullscreen,
	});

	const [pickerOpen, setPickerOpen] = useState(false);
	const openPicker = useCallback(() => {
		setPickerOpen(true);
		projectRail.setPickerActive(true);
	}, [projectRail.setPickerActive]);
	const closePicker = useCallback(() => {
		setPickerOpen(false);
		projectRail.setPickerActive(false);
	}, [projectRail.setPickerActive]);
	const mountProject = useCallback(
		async (project: { id: string } | null) => {
			if (!project) {
				return;
			}

			closePicker();
			activateProject(project.id);
			await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
		},
		[activateProject, closePicker, reactQueryClient],
	);
	const { mutate: addProject, isPending: addingProject, error: addProjectError } = useMutation(
		orpc.projects.add.mutationOptions({ onSuccess: mountProject }),
	);
	const { mutate: chooseDirectory } = useMutation(
		orpc.projects.chooseDirectory.mutationOptions({ onSuccess: mountProject }),
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
	return (
		<main ref={registerShortcuts} className="relative flex h-full bg-surface">
			<WindowControls />
			{continuity.failed && <ContinuityFailedNotice />}
			<ProjectRailFrame projectRail={projectRail} divider={railDivider} frameRef={railFrameRef} railWidth={railWidth}>
				<ProjectRail
					projects={availableProjects}
					activity={activity.projects}
					loading={projects.isPending}
					selectedId={activeProjectId}
					onSelect={activateProject}
					onAdd={openPicker}
					onOpenDirectory={(projectId) => openDirectory.mutate({ projectId })}
					onRemove={(projectId) => removeProject.mutate({ projectId })}
					onMove={moveProject.mutate}
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
						onAction={openPicker}
					/>
				)}
				<WorkspaceProvider control={control} agents={activity}>
					{!projects.isError && availableProjects.filter((project) => residentProjectIds.includes(project.id)).map((project) => {
						const workspace = continuity.restored.workspaces.find((entry) => entry.projectId === project.id);

						return (
							<ProjectWorkspace
								key={project.id}
								project={project}
								active={project.id === activeProjectId}
								shellFocusRequest={shellFocusRequest}
								fullscreen={projectRail.fullscreen}
								fullscreenAnimating={projectRail.animating}
								railResizing={railDivider.resizing}
								reviewOpen={reviewOpen}
								treeOpen={treeOpen}
								restoredShells={workspace?.shells}
								restoredActiveShellId={workspace?.activeShellId}
							/>
						);
					})}
				</WorkspaceProvider>
			</section>
			{pickerOpen && (
				<ProjectPicker
					adding={addingProject}
					addError={addProjectError?.message}
					onAdd={(path) => addProject({ path })}
					onOpenSystemPicker={() => chooseDirectory({})}
					onClose={closePicker}
				/>
			)}
		</main>
	);
}
