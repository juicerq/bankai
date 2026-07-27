import { memo, useCallback, useState } from "react";
import type { ContinuityShell } from "@main/store/continuity";
import type { Project } from "@main/store/projects";
import { ProjectWorkspaceHeader } from "@renderer/routes/-components/project-workspace-header";
import { ProjectWorkspaceShells } from "@renderer/routes/-components/project-workspace-shells";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
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
	treeOpen,
	shells,
	selectedShellId,
}: {
	project: Project;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	railResizing: boolean;
	reviewOpen: boolean;
	treeOpen: boolean;
	shells: ContinuityShell[];
	selectedShellId: string | undefined;
}) {
	const control = useWorkspaceControl();
	// A workspace that does not own the selection still has to name a shell for
	// the review to read, so it falls back to its first one.
	const activeShellId = shells.some((shell) => shell.id === selectedShellId) ? selectedShellId : shells[0]?.id;
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
	const registerWorkspace = useCallback(
		(node: HTMLElement | null) => {
			if (!node) {
				return;
			}

			return registerWorkspaceShortcuts();
		},
		[registerWorkspaceShortcuts],
	);

	return (
		<section
			ref={registerWorkspace}
			className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col ${active ? "" : "invisible"}`}
			aria-label={`${project.name} workspace`}
		>
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
					activeShellId={activeShellId}
					onOpenShell={control.onOpenShell}
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
						shellId={activeShellId}
						shells={shells}
						treeOpen={treeOpen}
						treeDivider={geometry.treeDivider}
					/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
});
