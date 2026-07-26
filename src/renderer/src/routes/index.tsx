import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";
import { ContinuityFailedNotice } from "@renderer/routes/-components/continuity-failed-notice";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectPicker } from "@renderer/routes/-components/project-picker";
import { ProjectFooter } from "@renderer/routes/-components/project-footer";
import { ProjectRailFrame } from "@renderer/routes/-components/project-rail-frame";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";
import { SessionSidebar } from "@renderer/routes/-components/session-sidebar";
import { ShellPicker } from "@renderer/routes/-components/shell-picker";
import { WindowControls } from "@renderer/routes/-components/window-controls";
import {
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-utils/rail-layout";
import { type SessionRow, sessionRows, successorRow } from "@renderer/routes/-utils/session-rows";
import { useAgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import { useBankaiShortcuts } from "@renderer/routes/-utils/use-bankai-shortcuts";
import { useContinuity } from "@renderer/routes/-utils/use-continuity";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { useLayoutPreferences } from "@renderer/routes/-utils/use-layout-preferences";
import { useSessionList } from "@renderer/routes/-utils/use-session-list";
import { useSessionCommands } from "@renderer/routes/-utils/use-session-commands";
import { useWorkspaceActivation } from "@renderer/routes/-utils/use-workspace-activation";
import { WorkspaceProvider } from "@renderer/routes/-utils/workspace-context";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";

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
	const [projectsOpen, setProjectsOpen] = useState(layout.initial.projectsOpen);
	const toggleProjects = useCallback(() => {
		setProjectsOpen(!projectsOpen);
		layout.persist({ projectsOpen: !projectsOpen });
	}, [layout.persist, projectsOpen]);
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
	const commands = useSessionCommands({
		restored: continuity.restored,
		onActivateProject: activateProject,
		onPersistSelection: continuity.selectShell,
		onPersistClose: continuity.closeShell,
	});
	const handleShellSelect = useCallback(
		(projectId: string, shellId: string) => {
			commands.noteSelection(projectId, shellId);
			continuity.selectShell(projectId, shellId);
		},
		[commands.noteSelection, continuity.selectShell],
	);
	const handleShellOpen = useCallback(
		(projectId: string, shell: ShellTab) => {
			commands.noteSelection(projectId, shell.id);
			continuity.openShell(projectId, shell);
		},
		[commands.noteSelection, continuity.openShell],
	);
	const rows = useMemo(
		() =>
			sessionRows({
				continuity: continuity.restored,
				projects: availableProjects,
				shellActivity: activity.shells,
				traces: activity.traces,
			}),
		[continuity.restored, availableProjects, activity.shells, activity.traces],
	);
	const sessions = useSessionList(rows, Date.now());
	const selectedShellId = activeProjectId ? commands.byProject[activeProjectId] : undefined;
	const handOverSelection = useCallback(
		(projectId: string, shellId: string) => {
			if (commands.byProject[projectId] !== shellId) {
				return;
			}

			const successor = successorRow(sessions.open, { projectId, shellId });
			if (successor) {
				commands.selectSession(successor.projectId, successor.shellId);
			}
		},
		[commands.byProject, commands.selectSession, sessions.open],
	);
	const closeSession = useCallback(
		(projectId: string, shellId: string) => {
			commands.closeSession(projectId, shellId);
			handOverSelection(projectId, shellId);
		},
		[commands.closeSession, handOverSelection],
	);
	const archiveSession = useCallback(
		(projectId: string, shellId: string) => {
			continuity.archiveShell(projectId, shellId);
			handOverSelection(projectId, shellId);
		},
		[continuity.archiveShell, handOverSelection],
	);
	const [pickerOpen, setPickerOpen] = useState(false);
	const openPicker = useCallback(() => {
		setPickerOpen(true);
		projectRail.setPickerActive(true);
	}, [projectRail.setPickerActive]);
	const closePicker = useCallback(() => {
		setPickerOpen(false);
		projectRail.setPickerActive(false);
	}, [projectRail.setPickerActive]);
	const [shellPickerOpen, setShellPickerOpen] = useState(false);
	const closeShellPicker = useCallback(() => {
		setShellPickerOpen(false);
		projectRail.setPickerActive(false);
	}, [projectRail.setPickerActive]);
	// The picker only earns its overlay when there is a choice to make: one
	// mounted project has a single answer, and asking for it would turn the
	// shortcut into two gestures for no decision.
	const requestNewShell = useCallback(() => {
		if (pickerOpen) {
			return;
		}

		const [onlyProject, ...rest] = availableProjects;
		if (!onlyProject) {
			return;
		}

		if (rest.length === 0) {
			commands.createSession(onlyProject.id);
			return;
		}

		setShellPickerOpen(true);
		projectRail.setPickerActive(true);
	}, [availableProjects, commands.createSession, pickerOpen, projectRail.setPickerActive]);
	const closeShellHere = useCallback(() => {
		if (activeProjectId && selectedShellId) {
			closeSession(activeProjectId, selectedShellId);
		}
	}, [activeProjectId, closeSession, selectedShellId]);
	const control = useMemo(
		() => ({
			initialDiffWidth: layout.initial.diffWidth,
			initialTreeWidth: layout.initial.treeWidth,
			onToggleFullscreen: projectRail.toggleFullscreen,
			onPersistLayout: layout.persist,
			onReviewOpenChange: handleReviewOpenChange,
			onTreeOpenChange: handleTreeOpenChange,
			onShellOpen: handleShellOpen,
			onShellClose: continuity.closeShell,
			onShellSelect: handleShellSelect,
			registerWorkspace: commands.registerWorkspace,
		}),
		[
			layout.initial.diffWidth,
			layout.initial.treeWidth,
			layout.persist,
			projectRail.toggleFullscreen,
			handleReviewOpenChange,
			handleTreeOpenChange,
			handleShellOpen,
			continuity.closeShell,
			handleShellSelect,
			commands.registerWorkspace,
		],
	);
	const [numbersVisible, setNumbersVisible] = useState(false);
	const holdModifier = useCallback(
		(held: boolean) => {
			setNumbersVisible(held);
			projectRail.setModifierHeld(held);
		},
		[projectRail.setModifierHeld],
	);
	const jumpToRow = useCallback(
		(index: number) => {
			const row = sessions.numbered[index];
			if (row) {
				commands.selectSession(row.projectId, row.shellId);
			}
		},
		[commands.selectSession, sessions.numbered],
	);
	const jumpToWaiting = useCallback(() => {
		if (sessions.waiting) {
			commands.selectSession(sessions.waiting.projectId, sessions.waiting.shellId);
		}
	}, [commands.selectSession, sessions.waiting]);
	const registerShortcuts = useBankaiShortcuts({
		onToggleFullscreen: projectRail.toggleFullscreen,
		onNewShell: requestNewShell,
		onCloseShell: closeShellHere,
		onModifierHold: holdModifier,
		onJumpToRow: jumpToRow,
		onJumpToWaiting: jumpToWaiting,
	});

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
	const removeProject = useMutation(
		orpc.projects.remove.mutationOptions({
			onSuccess: async (_, input) => {
				dropWorkspace(input.projectId);
				await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const openProject = useCallback(
		(projectId: string) => {
			const belongs = (row: SessionRow) => row.projectId === projectId;
			const target = sessions.open.find(belongs) ?? rows.find(belongs);
			if (target) {
				commands.selectSession(projectId, target.shellId);
				return;
			}

			commands.createSession(projectId);
		},
		[commands.createSession, commands.selectSession, rows, sessions.open],
	);
	const discardProject = useCallback(
		(projectId: string) => {
			const successor = activeProjectId === projectId
				? rows.find((row) => row.projectId !== projectId)
				: undefined;

			removeProject.mutate({ projectId });

			if (successor) {
				commands.selectSession(successor.projectId, successor.shellId);
			}
		},
		[activeProjectId, commands.selectSession, removeProject.mutate, rows],
	);
	const shellCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const row of rows) {
			counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);
		}

		return counts;
	}, [rows]);

	return (
		<main ref={registerShortcuts} className="relative flex h-full bg-surface">
			<WindowControls />
			{continuity.failed && <ContinuityFailedNotice />}
			<ProjectRailFrame projectRail={projectRail} divider={railDivider} frameRef={railFrameRef} railWidth={railWidth}>
				<SessionSidebar
					list={sessions}
					selectedShellId={selectedShellId}
					canCreateShell={availableProjects.length > 0}
					numbersVisible={numbersVisible}
					onSelect={commands.selectSession}
					onCreate={commands.createSession}
					onRequestShell={requestNewShell}
					onClose={closeSession}
					onArchive={archiveSession}
					onUnarchive={continuity.unarchiveShell}
					onRename={continuity.renameShell}
					footer={
						<ProjectFooter
							projects={availableProjects}
							loading={projects.isPending}
							open={projectsOpen}
							shellCounts={shellCounts}
							onToggle={toggleProjects}
							onOpenProject={openProject}
							onAdd={openPicker}
							onOpenDirectory={(projectId) => openDirectory.mutate({ projectId })}
							onRemove={discardProject}
							onOverlayChange={projectRail.setMenuOpen}
						/>
					}
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
								restoredActiveShellId={commands.byProject[project.id] ?? workspace?.activeShellId}
							/>
						);
					})}
				</WorkspaceProvider>
			</section>
			{shellPickerOpen && (
				<ShellPicker
					projects={availableProjects}
					activeProjectId={activeProjectId}
					shellCounts={shellCounts}
					onCreate={commands.createSession}
					onClose={closeShellPicker}
				/>
			)}
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
