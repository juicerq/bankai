import { useKeyboard } from "@opentui/react";
import { useSyncExternalStore } from "react";
import { type HarnessId, sessionKey } from "@core/harness/registry";
import { Logger } from "@core/logger";
import type { TabCapture } from "@core/session/TabSessionMonitor";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import type { RestorePlan } from "@core/workspace/planRestore";
import type { RestoreReview } from "@core/workspace/restoreWorkspace";
import { SPLIT_RATIO_DEFAULT } from "@core/workspace/WorkspaceGroup";
import type { WorkspaceRuntime } from "@core/workspace/WorkspaceRuntime";
import {
	type AppCommand,
	commandKey,
	leaderCommand,
	type PanelCommand,
	panelCommand,
	type ResizeCommand,
	resizeCommand,
} from "@ui/-utils/app-keymap";
import { useAppView } from "@ui/-utils/use-app-view";
import { usePanelView } from "@ui/-utils/use-panel-view";
import { useProjectOverlay } from "@ui/-utils/use-project-overlay";
import { useSessionReviews } from "@ui/-utils/use-session-reviews";
import { useSettingsOverlay } from "@ui/-utils/use-settings-overlay";
import { useWorkspacePersistence } from "@ui/-utils/use-workspace-persistence";
import { AppOverlays } from "@ui/components/app-overlays";
import { ProjectSidebar } from "@ui/components/project-sidebar";
import { ReviewScreen } from "@ui/components/review-screen/review-screen";
import { SplitPanel } from "@ui/components/split-panel";
import { TerminalBody } from "@ui/components/terminal-body";
import { theme } from "@ui/theme";

type AppProps = {
	supervisor: TabSupervisor;
	workspaceRuntime: WorkspaceRuntime;
	plan: RestorePlan;
	restoreReview: RestoreReview | null;
	initialCaptures: Record<string, TabCapture>;
	defaultHarness: HarnessId;
};

export function App({
	supervisor,
	workspaceRuntime,
	plan,
	restoreReview,
	initialCaptures,
	defaultHarness,
}: AppProps) {
	const workspace = useSyncExternalStore(workspaceRuntime.subscribe, workspaceRuntime.snapshot);
	const appView = useAppView(plan);
	const projectOverlay = useProjectOverlay();
	const settingsOverlay = useSettingsOverlay(defaultHarness);
	const sessionReviews = useSessionReviews(supervisor, restoreReview, initialCaptures);
	const currentView = appView.view;
	const tabCaptures = sessionReviews.snapshot.captures;
	const activeIndex = workspace.projects.findIndex(
		(project) => project.id === workspace.activeProjectId,
	);
	const activeProject = workspace.projects[activeIndex];
	const group = activeProject ? workspace.groups[activeProject.id] : undefined;
	const activeTab = group?.tabs[group.active];
	const activeTabId = activeTab?.id;
	const activeSplit = activeTab?.split ?? false;
	const activeSplitRatio = activeTab?.splitRatio ?? SPLIT_RATIO_DEFAULT;
	const splitVisible = activeSplit && activeTabId !== undefined;
	const activeCapture = activeTabId ? tabCaptures[activeTabId] : undefined;
	const panelSession = activeCapture?.state === "bound" ? activeCapture.session : null;
	const panelTurns = sessionReviews.reviews.presentation(panelSession).turns;
	const panelView = usePanelView(activeProject ? `${activeProject.id}:${activeTabId}` : undefined);
	const overlayOpen = projectOverlay.overlay !== null || settingsOverlay.open;
	const panelFocused = currentView.focus === "panel" && splitVisible && !overlayOpen;
	const zenMode = currentView.zen[currentView.screen.kind];
	const terminalFocused =
		currentView.focus === "terminal" && activeTabId !== undefined && !overlayOpen;

	useWorkspacePersistence({
		projects: workspace.projects,
		groups: workspace.groups,
		activeIndex,
		focus: currentView.focus === "panel" ? "terminal" : currentView.focus,
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
	const ensurePanelTurns = () => {
		if (activeCapture?.state === "bound") {
			sessionReviews.reviews.load(activeCapture.session, activeCapture.running !== undefined)
				.catch((err) => Logger.error("panel:load-failed", String(err)));
		}
	};
	const executePanel = (command: PanelCommand) => {
		switch (command.type) {
			case "blur":
				appView.focus("terminal");
				return;
			case "toggle-unified":
				panelView.toggleUnified();
				return;
			case "toggle-folded":
				panelView.toggleFolded();
				return;
			case "cycle-scope":
				if (panelView.cycleScope() === "turn") {
					ensurePanelTurns();
				}
		}
	};
	const executeResize = (command: ResizeCommand) => {
		switch (command.type) {
			case "resize-exit":
				appView.setResize(false);
				return;
			case "resize-step":
				workspaceRuntime.adjustActiveTabSplitRatio(command.delta);
		}
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
			case "open-settings":
				settingsOverlay.show();
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
			case "focus-panel":
				if (splitVisible) {
					appView.focus("panel");
				}
				return;
			case "open-review":
				openReview();
				return;
			case "toggle-split":
				if (activeTabId) {
					workspaceRuntime.toggleActiveTabSplit();
					if (!activeSplit) {
						appView.focus("panel");
					} else if (currentView.focus === "panel") {
						appView.focus("terminal");
					}
				}
				return;
			case "enter-resize":
				if (splitVisible) {
					appView.setResize(true);
				}
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
				if (currentView.focus === "panel") {
					appView.focus("terminal");
				}
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
		if (overlayOpen) {
			return;
		}
		if (currentView.resize) {
			const command = resizeCommand(key);
			if (command) {
				executeResize(command);
			}
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

		if (panelFocused) {
			const panel = panelCommand(key);
			if (panel) {
				executePanel(panel);
				return;
			}
			const leader = commandKey(key, false);
			if (leader?.type === "leader") {
				execute(leader);
			}
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
				cwd={activeProject?.cwd}
				turns={reviewPresentation.turns}
				availability={reviewPresentation.availability}
				unavailableReason={reviewPresentation.unavailableReason}
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
				statuses={sessionReviews.reviews.tabStatuses(group?.tabs.map((tab) => tab.id) ?? [])}
				leader={currentView.leader}
				resizeActive={currentView.resize}
				splitRatio={activeSplitRatio}
				zenMode={zenMode}
				splitPanel={splitVisible ? (
					<SplitPanel
						cwd={activeProject?.cwd}
						session={panelSession}
						turns={panelTurns}
						scope={panelView.scope}
						unified={panelView.unified}
						folded={panelView.folded}
						focused={panelFocused}
					/>
				) : null}
			/>
			<AppOverlays
				projectOverlay={projectOverlay}
				settingsOverlay={settingsOverlay}
				existingCwds={workspace.projects.map((project) => project.cwd)}
				activeProject={activeProject}
				onPick={pickProject}
				onRename={renameProject}
			/>
		</box>
	);
}
