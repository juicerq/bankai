import { memo, useCallback, useState } from "react";
import type { ContinuityShell } from "@shared/continuity";
import type { Project } from "@shared/projects";
import { ProjectWorkspaceHeader } from "@renderer/routes/-features/workspace/surface/project-workspace-header";
import { ProjectWorkspaceShells } from "@renderer/routes/-features/workspace/surface/project-workspace-shells";
import { ReviewPanel } from "@renderer/routes/-features/review/panel/review-panel";
import { ReviewPanelFrame, type ReviewPanelMotion } from "@renderer/routes/-features/review/panel/review-panel-frame";
import { createReviewPanelStore } from "@renderer/routes/-features/review/panel/review-panel-store";
import type { TerminalFileTarget } from "@renderer/routes/-features/terminal/terminal-file-links";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-features/workspace/surface/use-project-workspace-shortcuts";
import { useReviewGeometry } from "@renderer/routes/-features/review/panel/use-review-geometry";
import { useWorkspaceControl } from "@renderer/routes/-features/workspace/layout/workspace-context";

export const ProjectWorkspace = memo(function ProjectWorkspace({
	project,
	active,
	shellFocusRequest,
	fullscreen,
	fullscreenAnimating,
	railResizing,
	reviewOpen,
	reviewExpanded,
	treeOpen,
	shells,
	selectedShellId,
	serviceLogOpen,
}: {
	project: Project;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	railResizing: boolean;
	reviewOpen: boolean;
	reviewExpanded: boolean;
	treeOpen: boolean;
	shells: ContinuityShell[];
	selectedShellId: string | undefined;
	serviceLogOpen: boolean;
}) {
	const control = useWorkspaceControl();
	// A workspace that does not own the selection still has to name a shell for
	// the review to read, so it falls back to its first one.
	const activeShellId = shells.some((shell) => shell.id === selectedShellId) ? selectedShellId : shells[0]?.id;
	const geometry = useReviewGeometry({
		initialDiffWidth: control.initialDiffWidth,
		initialTreeWidth: control.initialTreeWidth,
		treeOpen,
		expanded: reviewExpanded,
		onPersistLayout: control.onPersistLayout,
	});
	const [motion, setMotion] = useState<ReviewPanelMotion>();
	const [quickOpen, setQuickOpen] = useState(false);
	const [reviewPanel] = useState(createReviewPanelStore);
	const startMotion = useCallback((kind: ReviewPanelMotion) => {
		setMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined : kind);
	}, []);

	const handleToggleReview = useCallback(() => {
		startMotion("open");
		// A panel that closes while expanded has to dock on the way out, or it would
		// stay laid over the shells with nothing left to animate it back.
		if (reviewOpen && reviewExpanded) {
			control.onReviewExpandedChange(false);
		}

		control.onReviewOpenChange(!reviewOpen);
	}, [control.onReviewExpandedChange, control.onReviewOpenChange, reviewExpanded, reviewOpen, startMotion]);

	const handleToggleReviewExpanded = useCallback(() => {
		startMotion("expand");
		control.onToggleReviewFocus();
	}, [control.onToggleReviewFocus, startMotion]);
	const handleOpenQuickOpen = useCallback(() => {
		if (!reviewOpen) {
			startMotion("open");
			control.onReviewOpenChange(true);
		}

		setQuickOpen(true);
	}, [control.onReviewOpenChange, reviewOpen, startMotion]);
	const handleOpenTerminalFile = useCallback(
		(worktree: string, target: TerminalFileTarget) => {
			if (!reviewOpen) {
				startMotion("open");
				control.onReviewOpenChange(true);
			}

			reviewPanel.actions.pinWorktree(worktree);
			reviewPanel.actions.focusFile(target.file, target.line);
		},
		[control.onReviewOpenChange, reviewOpen, reviewPanel, startMotion],
	);

	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		onToggleReview: handleToggleReview,
		onToggleReviewExpanded: handleToggleReviewExpanded,
		onOpenCommands: control.onOpenCommands,
		onOpenQuickOpen: handleOpenQuickOpen,
	});

	return (
		<section
			ref={registerWorkspaceShortcuts}
			className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col ${active ? "" : "invisible"}`}
			aria-label={`${project.name} workspace`}
		>
			<ProjectWorkspaceHeader
				project={project}
				active={active}
				fullscreen={fullscreen}
				animating={fullscreenAnimating}
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
					activeShellId={activeShellId}
					onRequestShell={control.onRequestShell}
					active={active}
					focusRequest={shellFocusRequest}
					resizeDeferred={fullscreenAnimating || motion !== undefined || geometry.resizing || railResizing}
					serviceLogOpen={serviceLogOpen}
					onOpenFile={handleOpenTerminalFile}
				/>
				<ReviewPanelFrame
					open={reviewOpen}
					expanded={reviewExpanded}
					motion={motion}
					width={geometry.dockedWidth}
					liveWidth={geometry.liveReviewWidth}
					divider={geometry.diffDivider}
					onMotionEnd={() => setMotion(undefined)}
				>
					<ReviewPanel
						panel={reviewPanel}
						project={project}
						shellId={activeShellId}
						shells={shells}
						treeOpen={treeOpen}
						treeDivider={geometry.treeDivider}
							expanded={reviewExpanded}
							onToggleExpanded={handleToggleReviewExpanded}
							quickOpen={{ open: quickOpen, onClose: () => setQuickOpen(false) }}
						/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
});
