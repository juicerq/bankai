import { memo, useCallback, useState } from "react";
import type { Project } from "@main/store/projects";
import type { LayoutSettings } from "@main/store/settings";
import type { AgentActivityState } from "@shared/activity";
import { ProjectWorkspaceHeader } from "@renderer/routes/-components/project-workspace-header";
import { ProjectWorkspaceShells } from "@renderer/routes/-components/project-workspace-shells";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
import { MIN_DIFF_WIDTH } from "@renderer/routes/-utils/review-layout";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { useReviewGeometry } from "@renderer/routes/-utils/use-review-geometry";
import { useShellTabs } from "@renderer/routes/-utils/use-shell-tabs";
import { worktreeActivity } from "@renderer/routes/-utils/worktree-activity";
import type { RestoredShell, ShellTab } from "@renderer/routes/-utils/shell-topology";

export const ProjectWorkspace = memo(function ProjectWorkspace({
	project,
	projects,
	shellActivity,
	shellWorktrees,
	active,
	shellFocusRequest,
	fullscreen,
	fullscreenAnimating,
	railResizing,
	onToggleFullscreen,
	initialDiffWidth,
	initialTreeWidth,
	onPersistLayout,
	reviewOpen,
	onReviewOpenChange,
	treeOpen,
	onTreeOpenChange,
	restoredShells,
	restoredActiveShellId,
	onShellOpen,
	onShellClose,
	onShellMove,
	onShellSelect,
}: {
	project: Project;
	projects: Project[];
	shellActivity: ReadonlyMap<string, AgentActivityState>;
	shellWorktrees: ReadonlyMap<string, string>;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	railResizing: boolean;
	onToggleFullscreen: () => void;
	initialDiffWidth: number;
	initialTreeWidth: number;
	onPersistLayout: (patch: LayoutSettings) => void;
	reviewOpen: boolean;
	onReviewOpenChange: (open: boolean) => void;
	treeOpen: boolean;
	onTreeOpenChange: (open: boolean) => void;
	restoredShells: RestoredShell[] | undefined;
	restoredActiveShellId: string | undefined;
	onShellOpen: (projectId: string, shell: ShellTab) => void;
	onShellClose: (projectId: string, shellId: string) => void;
	onShellMove: (projectId: string, shellId: string, toIndex: number) => void;
	onShellSelect: (projectId: string, shellId: string) => void;
}) {
	const shells = useShellTabs({
		projectId: project.id,
		restoredShells,
		restoredActiveShellId,
		onShellOpen,
		onShellClose,
		onShellMove,
		onShellSelect,
	});
	const geometry = useReviewGeometry({ initialDiffWidth, initialTreeWidth, treeOpen, onPersistLayout });
	const [reviewAnimating, setReviewAnimating] = useState(false);

	const handleToggleReview = useCallback(() => {
		setReviewAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		onReviewOpenChange(!reviewOpen);
	}, [onReviewOpenChange, reviewOpen]);

	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		tabs: shells.tabs,
		activeTabId: shells.activeTabId,
		onActivateTab: shells.selectTab,
		onCloseTab: shells.closeTab,
		onNewTab: shells.openTab,
		onToggleReview: handleToggleReview,
	});

	return (
		<section
			ref={registerWorkspaceShortcuts}
			className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col ${active ? "" : "invisible"}`}
			aria-label={`${project.name} workspace`}
		>
			<span ref={shells.registerDefaultShell} hidden />
			<ProjectWorkspaceHeader
				project={project}
				projects={projects}
				shells={shells}
				shellActivity={shellActivity}
				active={active}
				fullscreen={fullscreen}
				reviewOpen={reviewOpen}
				onToggleFullscreen={onToggleFullscreen}
				onToggleReview={handleToggleReview}
			/>

			<div
				ref={geometry.rowRef}
				className={`flex min-h-0 flex-1 ${geometry.resizing || railResizing ? "cursor-col-resize select-none" : ""}`}
			>
				<ProjectWorkspaceShells
					project={project}
					shells={shells}
					active={active}
					focusRequest={shellFocusRequest}
					resizeDeferred={fullscreenAnimating || reviewAnimating || geometry.resizing || railResizing}
				/>
				<ReviewPanelFrame
					open={reviewOpen}
					animate={reviewAnimating}
					width={geometry.reviewWidth}
					liveWidth={geometry.liveReviewWidth}
					divider={geometry.diffDivider}
					onMotionEnd={() => setReviewAnimating(false)}
				>
					<ReviewPanel
						project={project}
						shellId={shells.activeTabId}
						shellWorktree={shells.activeTabId === undefined ? undefined : shellWorktrees.get(shells.activeTabId)}
						worktreeActivity={worktreeActivity({ sessionIds: shells.sessionIds, shellWorktrees, shellActivity })}
						minDiffWidth={MIN_DIFF_WIDTH}
						treeOpen={treeOpen}
						treeDivider={geometry.treeDivider}
						onTreeOpenChange={onTreeOpenChange}
					/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
});
