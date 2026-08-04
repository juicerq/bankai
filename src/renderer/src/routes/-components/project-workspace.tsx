import { memo, useCallback, useState } from "react";
import type { ContinuityShell } from "@main/store/continuity";
import type { Project } from "@main/store/projects";
import { ProjectWorkspaceHeader } from "@renderer/routes/-components/project-workspace-header";
import { ProjectWorkspaceShells } from "@renderer/routes/-components/project-workspace-shells";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { ReviewPanelFrame, type ReviewPanelMotion } from "@renderer/routes/-components/review-panel-frame";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { useReviewGeometry } from "@renderer/routes/-utils/use-review-geometry";
import { useWorkspaceControl } from "@renderer/routes/-utils/workspace-context";

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

	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		onToggleReview: handleToggleReview,
		onToggleReviewExpanded: handleToggleReviewExpanded,
		onOpenCommands: control.onOpenCommands,
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
						project={project}
						shellId={activeShellId}
						shells={shells}
						treeOpen={treeOpen}
						treeDivider={geometry.treeDivider}
						expanded={reviewExpanded}
						onToggleExpanded={handleToggleReviewExpanded}
					/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
});
