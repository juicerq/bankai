import { memo, useCallback, useMemo, useState } from "react";
import type { Project } from "@main/store/projects";
import { ProjectWorkspaceHeader } from "@renderer/routes/-components/project-workspace-header";
import { ProjectWorkspaceShells } from "@renderer/routes/-components/project-workspace-shells";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { useReviewGeometry } from "@renderer/routes/-utils/use-review-geometry";
import { useShellTabs } from "@renderer/routes/-utils/use-shell-tabs";
import { useWorkspaceControl } from "@renderer/routes/-utils/workspace-context";
import type { RestoredShell } from "@renderer/routes/-utils/shell-topology";

export const ProjectWorkspace = memo(function ProjectWorkspace({
	project,
	active,
	shellFocusRequest,
	fullscreen,
	fullscreenAnimating,
	railResizing,
	reviewOpen,
	treeOpen,
	restoredShells,
	restoredActiveShellId,
}: {
	project: Project;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	railResizing: boolean;
	reviewOpen: boolean;
	treeOpen: boolean;
	restoredShells: RestoredShell[] | undefined;
	restoredActiveShellId: string | undefined;
}) {
	const control = useWorkspaceControl();
	const shells = useShellTabs({
		projectId: project.id,
		restoredShells,
		restoredActiveShellId,
		onShellOpen: control.onShellOpen,
		onShellClose: control.onShellClose,
		onShellSelect: control.onShellSelect,
	});
	const geometry = useReviewGeometry({
		initialDiffWidth: control.initialDiffWidth,
		initialTreeWidth: control.initialTreeWidth,
		treeOpen,
		onPersistLayout: control.onPersistLayout,
	});
	const [reviewAnimating, setReviewAnimating] = useState(false);

	const handleToggleReview = useCallback(() => {
		setReviewAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
		control.onReviewOpenChange(!reviewOpen);
	}, [control.onReviewOpenChange, reviewOpen]);

	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		onToggleReview: handleToggleReview,
	});
	const commands = useMemo(
		() => ({ selectShell: shells.selectTab, openShell: shells.openTab, closeShell: shells.closeTab }),
		[shells.selectTab, shells.openTab, shells.closeTab],
	);
	const registerWorkspace = useCallback(
		(node: HTMLElement | null) => {
			if (!node) {
				return;
			}

			const stopShortcuts = registerWorkspaceShortcuts();
			const stopCommands = control.registerWorkspace(project.id, commands);

			return () => {
				stopShortcuts();
				stopCommands();
			};
		},
		[commands, control.registerWorkspace, project.id, registerWorkspaceShortcuts],
	);

	return (
		<section
			ref={registerWorkspace}
			className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col ${active ? "" : "invisible"}`}
			aria-label={`${project.name} workspace`}
		>
			<span ref={shells.registerDefaultShell} hidden />
			<ProjectWorkspaceHeader
				project={project}
				active={active}
				fullscreen={fullscreen}
				reviewOpen={reviewOpen}
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
						tabs={shells.tabs}
						treeOpen={treeOpen}
						treeDivider={geometry.treeDivider}
					/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
});
