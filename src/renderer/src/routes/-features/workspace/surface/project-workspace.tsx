import { memo, useCallback, useRef, useState } from "react";
import { type ContinuityShell, shellTitle } from "@shared/continuity";
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
import { SessionPagePanel } from "@renderer/routes/-features/session-page/session-page-panel";
import type { SessionPageRegistryValue } from "@renderer/routes/-features/session-page/session-page-registry";
import { TodoPanel } from "@renderer/routes/-features/todos/todo-panel";
import type { WorkspaceBayMode } from "@renderer/routes/-features/review/panel/use-review-panel-state";

export const ProjectWorkspace = memo(function ProjectWorkspace({
	project,
	active,
	shellFocusRequest,
	fullscreen,
	fullscreenAnimating,
	railResizing,
	bayMode,
	reviewExpanded,
	treeOpen,
	shells,
	selectedShellId,
	serviceLogOpen,
	sessionPages,
	pageObscured,
}: {
	project: Project;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	railResizing: boolean;
	bayMode: WorkspaceBayMode;
	reviewExpanded: boolean;
	treeOpen: boolean;
	shells: ContinuityShell[];
	selectedShellId: string | undefined;
	serviceLogOpen: boolean;
	sessionPages: SessionPageRegistryValue;
	pageObscured: boolean;
}) {
	const control = useWorkspaceControl();
	// A workspace that does not own the selection still has to name a shell for
	// the review to read, so it falls back to its first one.
	const activeShell = shells.find((shell) => shell.id === selectedShellId) ?? shells[0];
	const activeShellId = activeShell?.id;
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
	const reviewOpen = bayMode === "review";
	const pageOpen = active && bayMode === "page" && !!activeShellId && sessionPages.has(activeShellId);
	const todosOpen = active && bayMode === "todos";
	const bayModeRef = useRef(bayMode);
	bayModeRef.current = bayMode;
	const restoreShellFocus = useCallback(() => {
		if (bayModeRef.current === "todos") {
			return;
		}

		control.onRequestShellFocus();
	}, [control.onRequestShellFocus]);
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

		control.onBayModeChange(reviewOpen ? "closed" : "review");
	}, [control.onBayModeChange, control.onReviewExpandedChange, reviewExpanded, reviewOpen, startMotion]);
	const handleTogglePage = useCallback(() => {
		if (!activeShellId) {
			return;
		}

		startMotion("open");
		if (pageOpen && reviewExpanded) {
			control.onReviewExpandedChange(false);
		}

		if (!pageOpen) {
			sessionPages.blank(activeShellId);
		}

		control.onBayModeChange(pageOpen ? "closed" : "page");
	}, [activeShellId, control.onBayModeChange, control.onReviewExpandedChange, pageOpen, reviewExpanded, sessionPages, startMotion]);
	const handleToggleTodos = useCallback(() => {
		startMotion("open");
		if (todosOpen && reviewExpanded) {
			control.onReviewExpandedChange(false);
		}

		control.onBayModeChange(todosOpen ? "closed" : "todos");
	}, [control.onBayModeChange, control.onReviewExpandedChange, reviewExpanded, startMotion, todosOpen]);
	const handleClosePage = useCallback(async () => {
		if (!activeShellId) {
			return;
		}

		startMotion("open");
		if (reviewExpanded) {
			control.onReviewExpandedChange(false);
		}

		control.onBayModeChange("closed");
		await sessionPages.release([activeShellId]);
	}, [activeShellId, control.onBayModeChange, control.onReviewExpandedChange, reviewExpanded, sessionPages, startMotion]);

	const handleToggleReviewExpanded = useCallback(() => {
		startMotion("expand");
		control.onToggleReviewFocus();
	}, [control.onToggleReviewFocus, startMotion]);
	const handleOpenQuickOpen = useCallback(() => {
		if (!reviewOpen) {
			startMotion("open");
			control.onBayModeChange("review");
		}

		setQuickOpen(true);
	}, [control.onBayModeChange, reviewOpen, startMotion]);
	const handleOpenTerminalFile = useCallback(
		(worktree: string, target: TerminalFileTarget) => {
			if (!reviewOpen) {
				startMotion("open");
				control.onBayModeChange("review");
			}

			reviewPanel.actions.pinWorktree(worktree);
			reviewPanel.actions.focusFile(target.file, target.line);
		},
		[control.onBayModeChange, reviewOpen, reviewPanel, startMotion],
	);
	const handleOpenTerminalUrl = useCallback((shellId: string, url: string) => {
		sessionPages.open(shellId, url);
		startMotion("open");
		control.onBayModeChange("page");
	}, [control.onBayModeChange, sessionPages, startMotion]);

	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		onToggleReview: handleToggleReview,
		onToggleReviewExpanded: handleToggleReviewExpanded,
		onTogglePage: handleTogglePage,
		onToggleTodos: handleToggleTodos,
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
				title={activeShell ? shellTitle(activeShell) : project.name}
				projectName={project.name}
				active={active}
				fullscreen={fullscreen}
				animating={fullscreenAnimating}
				reviewOpen={reviewOpen}
				pageOpen={pageOpen}
				todosOpen={todosOpen}
				shellId={activeShellId}
				onToggleReview={handleToggleReview}
				onTogglePage={handleTogglePage}
				onToggleTodos={handleToggleTodos}
				onOpenUrl={handleOpenTerminalUrl}
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
					onOpenUrl={handleOpenTerminalUrl}
				/>
				<ReviewPanelFrame
					open={reviewOpen || pageOpen || todosOpen}
					expanded={reviewExpanded}
					motion={motion}
					width={geometry.dockedWidth}
					liveWidth={geometry.liveReviewWidth}
					divider={geometry.diffDivider}
					onMotionEnd={() => setMotion(undefined)}
				>
					<div className={pageOpen || todosOpen ? "hidden" : "contents"}>
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
					</div>
					{pageOpen && activeShellId && (
						<SessionPagePanel
							registry={sessionPages}
							shellId={activeShellId}
							obscured={pageObscured}
							coverable={fullscreen}
							expanded={reviewExpanded}
							onToggleExpanded={handleToggleReviewExpanded}
							onClose={handleClosePage}
							onRestoreTerminalFocus={restoreShellFocus}
						/>
					)}
					{todosOpen && <TodoPanel project={project} onClose={handleToggleTodos} />}
				</ReviewPanelFrame>
			</div>
		</section>
	);
});
