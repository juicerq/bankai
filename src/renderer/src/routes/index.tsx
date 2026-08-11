import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ProjectCommand } from "@shared/project-commands";
import type { ContinuityShell } from "@shared/continuity";
import { orpc } from "@renderer/lib/api";
import { isBrowserClient } from "@renderer/lib/platform";
import { queryClient } from "@renderer/lib/query-client";
import { CommandsModal } from "@renderer/routes/-features/commands/commands-modal";
import { CommandsFooter } from "@renderer/routes/-features/commands/commands-footer";
import { ContinuityFailedNotice } from "@renderer/routes/-features/app/status/continuity-failed-notice";
import { EmptyState } from "@renderer/routes/-features/app/status/empty-state";
import { ProjectPicker } from "@renderer/routes/-features/projects/project-picker";
import { ProjectRailFrame } from "@renderer/routes/-features/workspace/layout/project-rail-frame";
import { ProjectWorkspace } from "@renderer/routes/-features/workspace/surface/project-workspace";
import { ServiceLogPane } from "@renderer/routes/-features/services/service-log-pane";
import { ServicesFooter } from "@renderer/routes/-features/services/services-footer";
import { SessionSidebar } from "@renderer/routes/-features/sessions/list/session-sidebar";
import { SettingsModal } from "@renderer/routes/-features/settings/settings-modal";
import { ShellPicker } from "@renderer/routes/-features/projects/shell-picker";
import { WindowControls } from "@renderer/routes/-features/app/chrome/window-controls";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-features/workspace/layout/layout-motion";
import {
	MAX_RAIL_WIDTH,
	MIN_RAIL_WIDTH,
	RAIL_WIDTH_PROPERTY,
	resolveRailWidth,
} from "@renderer/routes/-features/workspace/layout/rail-layout";
import { useSessionRows } from "@renderer/routes/-features/sessions/list/use-session-rows";
import { useAgentActivities } from "@renderer/routes/-features/sessions/list/use-agent-activity";
import { useBankaiShortcuts } from "@renderer/routes/-features/app/use-bankai-shortcuts";
import { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { useFocusTopBand } from "@renderer/routes/-features/workspace/layout/use-focus-top-band";
import { useFullscreenProjectRail } from "@renderer/routes/-features/workspace/layout/use-fullscreen-project-rail";
import { useLayoutPreferences } from "@renderer/routes/-features/workspace/layout/use-layout-preferences";
import { useReviewPanelState } from "@renderer/routes/-features/review/panel/use-review-panel-state";
import { useChosenProjects } from "@renderer/routes/-features/projects/use-chosen-projects";
import { useSessionList } from "@renderer/routes/-features/sessions/list/use-session-list";
import { useShellFocus } from "@renderer/routes/-features/sessions/lifecycle/use-shell-focus";
import { useProjectCommands } from "@renderer/routes/-features/commands/use-project-commands";
import { useServiceLog } from "@renderer/routes/-features/services/use-service-log";
import { useServiceOutput, useServices } from "@renderer/routes/-features/services/use-services";
import { useSessions } from "@renderer/routes/-features/sessions/lifecycle/use-sessions";
import {
	restoredResidentProjectIds,
	useWorkspaceActivation,
} from "@renderer/routes/-features/workspace/surface/use-workspace-activation";
import { WorkspaceProvider } from "@renderer/routes/-features/workspace/layout/workspace-context";
import { SessionPageRegistry } from "@renderer/routes/-features/session-page/session-page-registry";

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
		onClose: requestShellFocus,
	});
	const [sessionPages] = useState(SessionPageRegistry.create);
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

	const changeBayMode = useCallback((mode: "closed" | "review" | "page") => {
		if (mode !== "page" && selectedShellId) {
			sessionPages.close(selectedShellId);
		}

		reviewPanel.changeMode(mode);
	}, [reviewPanel.changeMode, selectedShellId, sessionPages]);

	useShellFocus(selectedShellId);
	const { activeProjectId, residentProjectIds, activateProject, dropWorkspace } = useWorkspaceActivation(
		availableProjects.map((project) => project.id),
		{
			activeProjectId: selectedProjectId,
			initialResidentProjectIds: restoredResidentProjectIds(workspaces),
		},
	);
	const commands = useProjectCommands(availableProjects);
	const services = useServices();
	const serviceCommands = useMemo(
		() => commands.commands.filter((command) => command.kind === "service"),
		[commands.commands],
	);
	const taskCommands = useMemo(
		() => commands.commands.filter((command) => command.kind === "task"),
		[commands.commands],
	);
	const closeBay = useCallback(() => {
		if (reviewPanel.mode !== "closed") {
			changeBayMode("closed");
		}
	}, [changeBayMode, reviewPanel.mode]);
	const serviceLog = useServiceLog({ services: serviceCommands, onOpen: closeBay });
	const serviceLogStatus = services.statusOf(serviceLog.opened?.id ?? "");
	const serviceLogOutput = useServiceOutput({ commandId: serviceLog.opened?.id, status: serviceLogStatus });
	const selectSession = useCallback(
		(projectId: string, shellId: string) => {
			if (selectedShellId && selectedShellId !== shellId) {
				sessionPages.close(selectedShellId);
			}

			if (reviewPanel.mode === "page" && !sessionPages.has(shellId)) {
				changeBayMode("closed");
			}
			sessions.selectShell(projectId, shellId);
			activateProject(projectId);
			serviceLog.close();
		},
		[activateProject, changeBayMode, reviewPanel.mode, selectedShellId, serviceLog.close, sessionPages, sessions.selectShell],
	);
	const createShell = useCallback(
		(projectId: string, plain?: boolean) => {
			if (reviewPanel.mode === "page") {
				changeBayMode("closed");
			}

			sessions.openShell(projectId, plain);
			activateProject(projectId);
		},
		[activateProject, changeBayMode, reviewPanel.mode, sessions.openShell],
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
			if (reviewPanel.mode === "page") {
				changeBayMode("closed");
			}
			sessions.archiveShell(selectedProjectId, selectedShellId);
		}
	}, [changeBayMode, reviewPanel.mode, selectedProjectId, sessions.archiveShell, selectedShellId]);
	const closeShell = useCallback((projectId: string, shellId: string) => {
		if (reviewPanel.mode === "page" && shellId === selectedShellId) {
			changeBayMode("closed");
		}
		sessionPages.release([shellId]).catch(() => {});
		sessions.closeShell(projectId, shellId);
	}, [changeBayMode, reviewPanel.mode, selectedShellId, sessionPages, sessions.closeShell]);
	const archiveShell = useCallback((projectId: string, shellId: string) => {
		if (reviewPanel.mode === "page" && shellId === selectedShellId) {
			changeBayMode("closed");
		}
		sessionPages.close(shellId);
		sessions.archiveShell(projectId, shellId);
	}, [changeBayMode, reviewPanel.mode, selectedShellId, sessionPages, sessions.archiveShell]);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const openSettings = useCallback(() => setSettingsOpen(true), []);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);
	const [commandsOpen, setCommandsOpen] = useState(false);
	const openCommands = useCallback(() => setCommandsOpen(true), []);
	const closeCommands = useCallback(() => setCommandsOpen(false), []);
	const runCommand = useCallback(
		(projectId: string, command: ProjectCommand) => {
			if (command.kind === "service") {
				services.toggle(command.id);

				return;
			}

			if (reviewPanel.mode === "page") {
				changeBayMode("closed");
			}

			activateProject(projectId);
			sessions.openCommandShell(projectId, command);
		},
		[activateProject, changeBayMode, reviewPanel.mode, services.toggle, sessions.openCommandShell],
	);
	const [servicesOpen, setServicesOpen] = useState(true);
	const toggleServices = useCallback(() => setServicesOpen((open) => !open), []);
	const [taskCommandsOpen, setTaskCommandsOpen] = useState(true);
	const toggleTaskCommands = useCallback(() => setTaskCommandsOpen((open) => !open), []);
	const handleBayModeChange = useCallback((mode: "closed" | "review" | "page") => {
		changeBayMode(mode);
		if (mode !== "closed") {
			serviceLog.close();
		}
	}, [changeBayMode, serviceLog.close]);
	const toggleReviewFocus = useCallback(() => {
		reviewPanel.toggleFocus();
		serviceLog.close();
	}, [reviewPanel.toggleFocus, serviceLog.close]);
	const control = useMemo(
		() => ({
			initialDiffWidth: layout.initial.diffWidth,
			initialTreeWidth: layout.initial.treeWidth,
			onToggleFullscreen: projectRail.toggleFullscreen,
			onOpenSettings: openSettings,
			onOpenCommands: openCommands,
			onPersistLayout: layout.persist,
			onBayModeChange: handleBayModeChange,
			onReviewExpandedChange: reviewPanel.changeExpanded,
			onToggleReviewFocus: toggleReviewFocus,
			onTreeOpenChange: handleTreeOpenChange,
			onRequestShell: requestNewShell,
			onRequestShellFocus: requestShellFocus,
		}),
		[
			layout.initial.diffWidth,
			layout.initial.treeWidth,
			layout.persist,
			projectRail.toggleFullscreen,
			openSettings,
			openCommands,
			reviewPanel.changeExpanded,
			handleBayModeChange,
			toggleReviewFocus,
			handleTreeOpenChange,
			requestNewShell,
			requestShellFocus,
		],
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
				if (reviewPanel.mode === "page" && selectedProjectId === input.projectId) {
					changeBayMode("closed");
				}

				const workspace = workspaces.find((entry) => entry.projectId === input.projectId);
				await sessionPages.release(workspace?.shells.map((shell) => shell.id) ?? []);
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
					onAddProject={openPicker}
					onToggleProject={chosen.toggle}
					onExcludeProject={chosen.chooseAllExcept}
					onClose={closeShell}
					onArchive={archiveShell}
					onUnarchive={sessions.unarchiveShell}
					onPin={sessions.pinShell}
					onUnpin={sessions.unpinShell}
					onRename={sessions.renameShell}
					footer={
						<>
							<CommandsFooter
								commands={taskCommands}
								projects={availableProjects}
								open={taskCommandsOpen}
								onToggle={toggleTaskCommands}
								onRun={(command) => runCommand(command.projectId, command)}
								onRemove={commands.remove}
							/>
							<ServicesFooter
								services={serviceCommands}
								projects={availableProjects}
								open={servicesOpen}
								states={services.states}
								openedCommandId={serviceLog.openedCommandId}
								onToggle={toggleServices}
								onStart={services.start}
								onStop={services.stop}
								onRestart={services.restart}
								onRemove={commands.remove}
								onOpenLog={serviceLog.toggle}
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
								bayMode={reviewPanel.mode}
								reviewExpanded={reviewPanel.expanded}
								treeOpen={treeOpen}
								shells={workspace?.shells ?? NO_SHELLS}
								selectedShellId={selectedShellId}
								serviceLogOpen={!!serviceLog.opened}
								sessionPages={sessionPages}
								pageObscured={settingsOpen || commandsOpen || pickerOpen || shellPickerOpen || !!serviceLog.opened}
							/>
						);
					})}
				</WorkspaceProvider>
				{serviceLog.opened && (
					<div
						data-component="service-log-frame"
						style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
						className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col bg-surface-sunken ease-out motion-reduce:transition-none ${
							projectRail.fullscreen ? "pt-0" : "pt-header"
						} ${projectRail.animating ? "transition-[padding]" : "transition-none"}`}
					>
						<ServiceLogPane
							projectId={serviceLog.opened.projectId}
							commandId={serviceLog.opened.id}
							label={serviceLog.opened.label}
							status={serviceLogStatus}
							output={serviceLogOutput.output}
							outputPending={serviceLogOutput.pending}
							resizeDeferred={projectRail.animating || railDivider.resizing}
							onClose={serviceLog.close}
						/>
					</div>
				)}
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
			{settingsOpen && (
				<SettingsModal
					projects={availableProjects}
					shellCounts={shellCounts}
					onOpenDirectory={(projectId) => openDirectory.mutate({ projectId })}
					onRemoveProject={(projectId) => removeProject.mutate({ projectId })}
					onClose={closeSettings}
				/>
			)}
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
