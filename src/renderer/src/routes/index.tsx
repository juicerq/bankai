import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ProjectCommand } from "@main/store/commands";
import type { ContinuityShell } from "@main/store/continuity";
import { orpc } from "@renderer/lib/api";
import { isBrowserClient } from "@renderer/lib/platform";
import { queryClient } from "@renderer/lib/query-client";
import { CommandsModal } from "@renderer/routes/-components/commands-modal";
import { ContinuityFailedNotice } from "@renderer/routes/-components/continuity-failed-notice";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ProjectPicker } from "@renderer/routes/-components/project-picker";
import { ProjectFooter } from "@renderer/routes/-components/project-footer";
import { ProjectRailFrame } from "@renderer/routes/-components/project-rail-frame";
import { ProjectWorkspace } from "@renderer/routes/-components/project-workspace";
import { ServicesFooter } from "@renderer/routes/-components/services-footer";
import { SessionSidebar } from "@renderer/routes/-components/session-sidebar";
import { SettingsModal } from "@renderer/routes/-components/settings-modal";
import { ShellPicker } from "@renderer/routes/-components/shell-picker";
import { WindowControls } from "@renderer/routes/-components/window-controls";
import {
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-utils/rail-layout";
import { useSessionRows } from "@renderer/routes/-utils/use-session-rows";
import { useAgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import { useBankaiShortcuts } from "@renderer/routes/-utils/use-bankai-shortcuts";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useFocusTopBand } from "@renderer/routes/-utils/use-focus-top-band";
import { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";
import { useLayoutPreferences } from "@renderer/routes/-utils/use-layout-preferences";
import { useReviewPanelState } from "@renderer/routes/-utils/use-review-panel-state";
import { useChosenProjects } from "@renderer/routes/-utils/use-chosen-projects";
import { useSessionList } from "@renderer/routes/-utils/use-session-list";
import { useShellFocus } from "@renderer/routes/-utils/use-shell-focus";
import { useProjectCommands } from "@renderer/routes/-utils/use-project-commands";
import { useServices } from "@renderer/routes/-utils/use-services";
import { useSessions } from "@renderer/routes/-utils/use-sessions";
import {
	restoredResidentProjectIds,
	useWorkspaceActivation,
} from "@renderer/routes/-utils/use-workspace-activation";
import { WorkspaceProvider } from "@renderer/routes/-utils/workspace-context";

const NO_SHELLS: ContinuityShell[] = [];

export const Route = createFileRoute("/")({
	component: Bankai,
	beforeLoad: () => {
		if (isBrowserClient()) {
			throw redirect({ to: "/mobile" });
		}
	},
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
	const [shellFocusRequest, setShellFocusRequest] = useState(0);
	const requestShellFocus = useCallback(() => setShellFocusRequest((current) => current + 1), []);
	const topBand = useFocusTopBand({ initialFullscreen: layout.initial.fullscreen });
	const handleFullscreenChange = useCallback(
		(fullscreen: boolean) => {
			topBand.handleFullscreenChange(fullscreen);
			layout.persist({ fullscreen });
		},
		[topBand.handleFullscreenChange, layout.persist],
	);
	const reviewPanel = useReviewPanelState({
		initialOpen: layout.initial.reviewOpen,
		initialExpanded: layout.initial.reviewExpanded,
		persist: layout.persist,
	});
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
		onFullscreenChange: handleFullscreenChange,
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
	const sessions = useSessions();
	const workspaces = sessions.continuity.workspaces;
	const selectedShellId = sessions.continuity.selectedShellId;
	const selectedProjectId = useMemo(
		() => workspaces.find((workspace) => workspace.shells.some((shell) => shell.id === selectedShellId))?.projectId,
		[workspaces, selectedShellId],
	);

	useShellFocus(selectedShellId);
	const { activeProjectId, residentProjectIds, activateProject, dropWorkspace } = useWorkspaceActivation(
		availableProjects.map((project) => project.id),
		{
			activeProjectId: selectedProjectId,
			initialResidentProjectIds: restoredResidentProjectIds(workspaces),
		},
	);
	const selectSession = useCallback(
		(projectId: string, shellId: string) => {
			sessions.selectShell(projectId, shellId);
			activateProject(projectId);
		},
		[activateProject, sessions.selectShell],
	);
	const createShell = useCallback(
		(projectId: string, plain?: boolean) => {
			sessions.openShell(projectId, plain);
			activateProject(projectId);
		},
		[activateProject, sessions.openShell],
	);
	const rows = useSessionRows({ continuity: sessions.continuity, projects: availableProjects, activity });
	const chosen = useChosenProjects();
	const list = useSessionList({ rows, now: Date.now(), projectIds: chosen.projectIds });
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
	const plainRequest = useRef(false);
	const requestNewShell = useCallback(
		(plain: boolean) => {
			if (pickerOpen) {
				return;
			}

			const [onlyProject, ...rest] = availableProjects;
			if (!onlyProject) {
				return;
			}

			if (rest.length === 0) {
				createShell(onlyProject.id, plain);
				return;
			}

			plainRequest.current = plain;
			setShellPickerOpen(true);
			projectRail.setPickerActive(true);
		},
		[availableProjects, createShell, pickerOpen, projectRail.setPickerActive],
	);
	const createRequestedShell = useCallback(
		(projectId: string) => createShell(projectId, plainRequest.current),
		[createShell],
	);
	const archiveShellHere = useCallback(() => {
		if (selectedProjectId && selectedShellId) {
			sessions.archiveShell(selectedProjectId, selectedShellId);
		}
	}, [selectedProjectId, sessions.archiveShell, selectedShellId]);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const openSettings = useCallback(() => setSettingsOpen(true), []);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);
	const [commandsOpen, setCommandsOpen] = useState(false);
	const openCommands = useCallback(() => setCommandsOpen(true), []);
	const closeCommands = useCallback(() => setCommandsOpen(false), []);
	const commands = useProjectCommands(availableProjects);
	const services = useServices();
	const runCommand = useCallback(
		(projectId: string, command: ProjectCommand) => {
			if (command.kind === "service") {
				services.toggle(command.id);

				return;
			}

			activateProject(projectId);
			sessions.openCommandShell(projectId, command);
		},
		[activateProject, services.toggle, sessions.openCommandShell],
	);
	const [servicesOpen, setServicesOpen] = useState(true);
	const toggleServices = useCallback(() => setServicesOpen((open) => !open), []);
	const [openedService, setOpenedService] = useState<{ projectId: string; commandId: string }>();
	const closeServiceLog = useCallback(() => setOpenedService(undefined), []);
	const openServiceLog = useCallback(
		(projectId: string, commandId: string) => {
			setOpenedService((current) => current?.commandId === commandId ? undefined : { projectId, commandId });
			activateProject(projectId);
		},
		[activateProject],
	);
	const serviceCommands = useMemo(
		() => commands.commands.filter((command) => command.kind === "service"),
		[commands.commands],
	);
	const serviceLogOf = useCallback(
		(projectId: string) => {
			if (openedService?.projectId !== projectId) {
				return;
			}

			const command = serviceCommands.find((service) => service.id === openedService.commandId);
			if (!command) {
				return;
			}

			return { commandId: command.id, label: command.label, status: services.statusOf(command.id) };
		},
		[openedService, serviceCommands, services.statusOf],
	);
	const control = useMemo(
		() => ({
			initialDiffWidth: layout.initial.diffWidth,
			initialTreeWidth: layout.initial.treeWidth,
			onToggleFullscreen: projectRail.toggleFullscreen,
			onOpenSettings: openSettings,
			onOpenCommands: openCommands,
			onPersistLayout: layout.persist,
			onReviewOpenChange: reviewPanel.changeOpen,
			onReviewExpandedChange: reviewPanel.changeExpanded,
			onToggleReviewFocus: reviewPanel.toggleFocus,
			onTreeOpenChange: handleTreeOpenChange,
			onRequestShell: requestNewShell,
		}),
		[
			layout.initial.diffWidth,
			layout.initial.treeWidth,
			layout.persist,
			projectRail.toggleFullscreen,
			openSettings,
			openCommands,
			reviewPanel.changeExpanded,
			reviewPanel.changeOpen,
			reviewPanel.toggleFocus,
			handleTreeOpenChange,
			requestNewShell,
		],
	);
	const holdModifier = useCallback(
		(held: boolean) => projectRail.setModifierHeld(held),
		[projectRail.setModifierHeld],
	);
	const jumpToRow = useCallback(
		(index: number) => {
			const row = list.numbered[index];
			if (row) {
				selectSession(row.projectId, row.shellId);
			}
		},
		[selectSession, list.numbered],
	);
	const jumpToWaiting = useCallback(() => {
		if (list.waiting) {
			selectSession(list.waiting.projectId, list.waiting.shellId);
		}
	}, [selectSession, list.waiting]);
	const registerShortcuts = useBankaiShortcuts({
		onToggleFullscreen: projectRail.toggleFullscreen,
		onNewShell: requestNewShell,
		onArchiveShell: archiveShellHere,
		onOpenSettings: openSettings,
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

			const mounted = workspaces.find((workspace) => workspace.projectId === project.id);
			if (mounted?.shells.length) {
				activateProject(project.id);
			} else {
				createShell(project.id);
			}

			await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
		},
		[activateProject, closePicker, createShell, reactQueryClient, workspaces],
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
				chosen.forget(input.projectId);
				await reactQueryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
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
			{sessions.failed && <ContinuityFailedNotice />}
			<ProjectRailFrame projectRail={projectRail} divider={railDivider} frameRef={railFrameRef} railWidth={railWidth}>
				<SessionSidebar
					list={list}
					projects={availableProjects}
					chosenProjectIds={chosen.projectIds}
					selectedShellId={selectedShellId}
					canCreateShell={availableProjects.length > 0}
					onSelect={selectSession}
					onCreate={createShell}
					onRequestShell={requestNewShell}
					onToggleProject={chosen.toggle}
					onClose={sessions.closeShell}
					onArchive={sessions.archiveShell}
					onUnarchive={sessions.unarchiveShell}
					onRename={sessions.renameShell}
					footer={
						<>
							<ServicesFooter
								services={serviceCommands}
								projects={availableProjects}
								open={servicesOpen}
								states={services.states}
								openedCommandId={openedService?.commandId}
								onToggle={toggleServices}
								onToggleService={services.toggle}
								onOpenLog={openServiceLog}
							/>
							<ProjectFooter
							projects={availableProjects}
							loading={projects.isPending}
							open={projectsOpen}
							shellCounts={shellCounts}
							chosenProjectIds={chosen.projectIds}
							onToggle={toggleProjects}
							onToggleProject={chosen.toggle}
							onAdd={openPicker}
							onOpenDirectory={(projectId) => openDirectory.mutate({ projectId })}
							onRemove={(projectId) => removeProject.mutate({ projectId })}
							onOverlayChange={projectRail.setMenuOpen}
							/>
						</>
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
				<WorkspaceProvider control={control} agents={activity} residency={sessions.residency} topBand={topBand.band}>
					{!projects.isError && availableProjects.filter((project) => residentProjectIds.includes(project.id)).map((project) => {
						const workspace = workspaces.find((entry) => entry.projectId === project.id);

						return (
							<ProjectWorkspace
								key={project.id}
								project={project}
								active={project.id === activeProjectId}
								shellFocusRequest={shellFocusRequest}
								fullscreen={projectRail.fullscreen}
								fullscreenAnimating={projectRail.animating}
								railResizing={railDivider.resizing}
								reviewOpen={reviewPanel.open}
								reviewExpanded={reviewPanel.expanded}
								treeOpen={treeOpen}
								shells={workspace?.shells ?? NO_SHELLS}
								selectedShellId={selectedShellId}
								serviceLog={serviceLogOf(project.id)}
								onCloseServiceLog={closeServiceLog}
							/>
						);
					})}
				</WorkspaceProvider>
			</section>
			<WindowControls fullscreen={projectRail.fullscreen} topBand={topBand} />
			{shellPickerOpen && (
				<ShellPicker
					projects={availableProjects}
					activeProjectId={activeProjectId}
					shellCounts={shellCounts}
					onCreate={createRequestedShell}
					onClose={closeShellPicker}
				/>
			)}
			{settingsOpen && <SettingsModal onClose={closeSettings} />}
			{commandsOpen && (
				<CommandsModal projects={availableProjects} onRun={runCommand} onClose={closeCommands} />
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
