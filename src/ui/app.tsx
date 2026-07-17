import { useKeyboard } from "@opentui/react";
import { useSyncExternalStore } from "react";
import { sessionKey } from "@core/harness/registry";
import { Logger } from "@core/logger";
import type { TabCapture } from "@core/session/TabSessionMonitor";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import type { RestorePlan } from "@core/workspace/planRestore";
import type { RestoreReview } from "@core/workspace/restoreWorkspace";
import type { WorkspaceRuntime } from "@core/workspace/WorkspaceRuntime";
import { type AppCommand, commandKey, leaderCommand } from "@ui/-utils/app-keymap";
import { useAppView } from "@ui/-utils/use-app-view";
import { useProjectOverlay } from "@ui/-utils/use-project-overlay";
import { useSessionReviews } from "@ui/-utils/use-session-reviews";
import { useWorkspacePersistence } from "@ui/-utils/use-workspace-persistence";
import { ProjectPicker } from "@ui/components/project-picker";
import { ProjectPickerState } from "@ui/components/project-picker-state";
import { ProjectRenameOverlay } from "@ui/components/project-rename-overlay";
import { ProjectSidebar } from "@ui/components/project-sidebar";
import { ReviewScreen } from "@ui/components/review-screen/review-screen";
import { TerminalBody } from "@ui/components/terminal-body";
import { theme } from "@ui/theme";

type AppProps = {
	supervisor: TabSupervisor;
	workspaceRuntime: WorkspaceRuntime;
	plan: RestorePlan;
	restoreReview: RestoreReview | null;
	initialCaptures: Record<string, TabCapture>;
};

export function App({
	supervisor,
	workspaceRuntime,
	plan,
	restoreReview,
	initialCaptures,
}: AppProps) {
	const workspace = useSyncExternalStore(workspaceRuntime.subscribe, workspaceRuntime.snapshot);
	const appView = useAppView(plan);
	const projectOverlay = useProjectOverlay();
	const sessionReviews = useSessionReviews(supervisor, restoreReview, initialCaptures);
	const currentView = appView.view;
	const tabCaptures = sessionReviews.snapshot.captures;
	const activeIndex = workspace.projects.findIndex(
		(project) => project.id === workspace.activeProjectId,
	);
	const activeProject = workspace.projects[activeIndex];
	const group = activeProject ? workspace.groups[activeProject.id] : undefined;
	const activeTabId = group?.tabs[group.active];
	const zenMode = currentView.zen[currentView.screen.kind];
	const terminalFocused =
		currentView.focus === "terminal" && activeTabId !== undefined && projectOverlay.overlay === null;

	useWorkspacePersistence({
		projects: workspace.projects,
		groups: workspace.groups,
		activeIndex,
		focus: currentView.focus,
		zen: currentView.zen,
		screen: currentView.screen.kind,
		reviewSession: currentView.screen.kind === "review" ? currentView.screen.session : null,
		captures: tabCaptures,
	});

	const openReview = () => {
		const capture = activeTabId ? tabCaptures[activeTabId] : undefined;
		if (capture?.state !== "bound") {
			appView.openReview(null);
			return;
		}

		appView.openReview(capture.session);
		sessionReviews.reviews.load(capture.session, capture.running !== undefined)
			.catch((err) => Logger.error("review:load-failed", String(err)));
	};
	const pickProject = (cwd: string) => {
		projectOverlay.close();
		workspaceRuntime.selectOrAddProject(cwd)
			.catch((err) => Logger.error("projects:add-failed", String(err)));
		appView.focus("terminal");
	};
	const renameProject = (name: string) => {
		projectOverlay.close();
		workspaceRuntime.renameActiveProject(name)
			.catch((err) => Logger.error("projects:rename-failed", String(err)));
	};

	const execute = (command: AppCommand) => {
		switch (command.type) {
			case "leader":
				appView.setLeader(true);
				return;
			case "toggle-zen":
				if (currentView.screen.kind === "review" || zenMode || activeTabId) {
					appView.toggleZen();
					if (currentView.screen.kind === "command" && !zenMode) {
						appView.focus("terminal");
					}
				}
				return;
			case "quit":
				supervisor.disposeAll();
				return process.exit(0);
			case "input":
				if (activeTabId) {
					supervisor.input(activeTabId, command.raw);
				}
				return;
			case "focus-sidebar":
				appView.focus("sidebar");
				return;
			case "open-review":
				openReview();
				return;
			case "select-project":
				if (workspaceRuntime.activateProjectAt(command.index)) {
					appView.focus("terminal");
				}
				return;
			case "select-tab":
				if (workspaceRuntime.selectTab(command.index)) {
					appView.focus("terminal");
				}
				return;
			case "move-project":
				workspaceRuntime.moveActiveProject(command.direction)
					.catch((err) => Logger.error("projects:move-failed", String(err)));
				return;
			case "select-project-offset":
				workspaceRuntime.selectProject(command.direction);
				return;
			case "enter-terminal":
				workspaceRuntime.enterActiveProject();
				appView.focus("terminal");
				return;
			case "open-tab":
				workspaceRuntime.openTab();
				appView.focus("terminal");
				return;
			case "close-tab":
				workspaceRuntime.closeActiveTab();
				return;
			case "cycle-tab":
				workspaceRuntime.cycleTab(command.direction);
				appView.focus("terminal");
				return;
			case "open-picker":
				projectOverlay.openPicker();
				return;
			case "rename-project":
				if (activeProject) {
					projectOverlay.openRename();
				}
				return;
			case "remove-project":
				workspaceRuntime.removeActiveProject()
					.catch((err) => Logger.error("projects:remove-failed", String(err)));
				appView.focus("sidebar");
		}
	};

	useKeyboard((key) => {
		if (projectOverlay.overlay) {
			return;
		}
		if (currentView.leader) {
			appView.setLeader(false);
			const command = leaderCommand(key);
			if (command) {
				execute(command);
			}
			return;
		}
		if (currentView.screen.kind === "review") {
			return;
		}

		const command = commandKey(key, terminalFocused);
		if (command) {
			execute(command);
		}
	});

	const reviewPresentation = sessionReviews.reviews.presentation(
		currentView.screen.kind === "review" ? currentView.screen.session : null,
	);
	const toggleReviewed = (turnId: string) => {
		if (currentView.screen.kind === "review" && currentView.screen.session) {
			sessionReviews.reviews.toggle(currentView.screen.session, turnId)
				.catch((err) => Logger.error("review:toggle-failed", String(err)));
		}
	};

	if (currentView.screen.kind === "review") {
		return (
			<ReviewScreen
				key={currentView.screen.session ? sessionKey(currentView.screen.session) : "unbound"}
				session={currentView.screen.session}
				turns={reviewPresentation.turns}
				availability={reviewPresentation.availability}
				reviewedTurnIds={reviewPresentation.reviewedTurnIds}
				onToggleReviewed={toggleReviewed}
				onClose={appView.closeReview}
				zenMode={zenMode}
			/>
		);
	}

	return (
		<box style={{ width: "100%", height: "100%", flexDirection: "row", backgroundColor: theme.bg }}>
			{!zenMode && (
				<ProjectSidebar projects={workspace.projects} activeProjectId={workspace.activeProjectId} />
			)}
			<TerminalBody
				project={activeProject}
				group={group}
				supervisor={supervisor}
				activeTabId={activeTabId}
				terminalFocused={terminalFocused}
				statuses={sessionReviews.reviews.tabStatuses(group?.tabs ?? [])}
				leader={currentView.leader}
				zenMode={zenMode}
			/>
			{projectOverlay.overlay?.kind === "picker" && projectOverlay.overlay.state === "ready" && (
				<ProjectPicker
					home={projectOverlay.home}
					entries={projectOverlay.overlay.entries}
					existingCwds={workspace.projects.map((project) => project.cwd)}
					onPick={pickProject}
					onCancel={projectOverlay.close}
				/>
			)}
			{projectOverlay.overlay?.kind === "picker" && projectOverlay.overlay.state === "loading" && (
				<ProjectPickerState
					status="loading"
					onCancel={projectOverlay.close}
				/>
			)}
			{projectOverlay.overlay?.kind === "picker" && projectOverlay.overlay.state === "error" && (
				<ProjectPickerState
					status="error"
					message={projectOverlay.overlay.message}
					onCancel={projectOverlay.close}
				/>
			)}
			{projectOverlay.overlay?.kind === "rename" && activeProject && (
				<ProjectRenameOverlay
					current={activeProject.name}
					onSubmit={renameProject}
					onCancel={projectOverlay.close}
				/>
			)}
		</box>
	);
}
