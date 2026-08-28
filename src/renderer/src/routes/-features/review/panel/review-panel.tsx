import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useRef } from "react";
import type { ContinuityShell } from "@shared/continuity";
import type { Project } from "@shared/projects";
import { ReviewDefaultClosure, type ReviewClosedTarget } from "@shared/review-default-closure";
import { orpc } from "@renderer/lib/api";
import { ReviewBrowseEmpty } from "@renderer/routes/-features/review/reading/review-browse-empty";
import { ReviewDiff, type ReviewDiffHandle } from "@renderer/routes/-features/review/reading/review-diff";
import { ReviewFocusedFile } from "@renderer/routes/-features/review/reading/review-focused-file";
import { ReviewHeader } from "@renderer/routes/-features/review/header/review-header";
import { ReviewQuickOpen } from "@renderer/routes/-features/review/header/review-quick-open/review-quick-open";
import { ReviewTree } from "@renderer/routes/-features/review/tree/review-tree";
import type { ReviewWorktreeSelection } from "@renderer/routes/-features/review/header/review-worktree-menu";
import { MIN_DIFF_WIDTH, REVIEW_DIFF_WIDTH_VALUE } from "@renderer/routes/-features/review/panel/review-layout";
import type { ReviewPanelStore } from "@renderer/routes/-features/review/panel/review-panel-store";
import { resolveReviewWorktree } from "@renderer/routes/-features/review/header/review-worktree";
import { sharedWorktreeShells } from "@renderer/routes/-features/review/header/shared-worktree";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { useReviewReading } from "@renderer/routes/-features/review/reading/use-review-reading";
import { worktreeActivity } from "@renderer/routes/-features/review/header/worktree-activity";
import { useWorkspaceAgents, useWorkspaceControl } from "@renderer/routes/-features/workspace/layout/workspace-context";

function useWorktreeSelection({
	project,
	shellWorktree,
	pinnedWorktree,
	agents,
	onSelect,
}: {
	project: Project;
	shellWorktree?: string;
	pinnedWorktree?: string;
	agents: ReturnType<typeof useWorkspaceAgents>;
	onSelect: ReviewWorktreeSelection["onSelect"];
}) {
	const queryClient = useQueryClient();
	const { data: worktreeData } = useQuery(orpc.review.worktrees.queryOptions({ input: { projectId: project.id } }));
	const {
		error: removeWorktreeError,
		variables: removeWorktreeVariables,
		mutate: removeWorktree,
	} = useMutation(
		orpc.review.removeWorktree.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.review.worktrees.key() });
			},
		}),
	);

	const worktrees = worktreeData ?? [];
	const worktree = resolveReviewWorktree({ pinned: pinnedWorktree, shellWorktree, worktrees }) ?? project.path;
	const removeFailure = removeWorktreeError && removeWorktreeVariables
		? { path: removeWorktreeVariables.worktree, message: removeWorktreeError.message }
		: undefined;

	const worktreeSelection: ReviewWorktreeSelection = {
		worktrees,
		activePath: worktree,
		mainPath: project.path,
		pinnedPath: worktree === pinnedWorktree ? pinnedWorktree : undefined,
		shellPath: shellWorktree,
		activity: worktreeActivity({ shellWorktrees: agents.worktrees, shellActivity: agents.shells }),
		removeFailure,
		onSelect,
		onRemove: (path) => removeWorktree({ projectId: project.id, worktree: path }),
	};

	return { worktree, worktreeSelection };
}

export function ReviewPanel({
	panel,
	project,
	shellId,
	shells,
	treeOpen,
	treeDivider,
	expanded,
	onToggleExpanded,
	quickOpen,
}: {
	panel: ReviewPanelStore;
	project: Project;
	shellId?: string;
	shells: ContinuityShell[];
	treeOpen: boolean;
	treeDivider: ReturnType<typeof useDivider>;
	expanded: boolean;
	onToggleExpanded: () => void;
	quickOpen: { open: boolean; onClose: () => void };
}) {
	const { onTreeOpenChange } = useWorkspaceControl();
	const agents = useWorkspaceAgents();
	const shellWorktree = shellId === undefined ? undefined : agents.worktrees.get(shellId);
	const mode = useSelector(panel, (state) => state.mode);
	const treeView = useSelector(panel, (state) => state.treeView);
	const fileClosedOverrides = useSelector(panel, (state) => state.fileClosedOverrides);
	const focusedPath = useSelector(panel, (state) => state.focusedPath);
	const focusedLine = useSelector(panel, (state) => state.focusedLine);
	const pinnedWorktree = useSelector(panel, (state) => state.pinnedWorktree);
	const diff = useRef<ReviewDiffHandle>(null);
	const isFileOpen = useCallback(
		(path: string) => !(fileClosedOverrides.get(path) ?? ReviewDefaultClosure.matches(project.reviewClosedTargets, path)),
		[fileClosedOverrides, project.reviewClosedTargets],
	);

	const { worktree, worktreeSelection } = useWorktreeSelection({
		project,
		shellWorktree,
		pinnedWorktree,
		agents,
		onSelect: panel.actions.pinWorktree,
	});

	const { data: browsePaths } = useQuery(
		orpc.review.browseFiles.queryOptions({
			input: { projectId: project.id, worktree },
			enabled: quickOpen.open || (treeOpen && treeView === "browse"),
		}),
	);

	const { generation, fullFile, fullFileError, error, refreshing } = useReviewReading({
		projectId: project.id,
		worktree,
		mode,
		shellId,
		isFileOpen,
		focusedPath,
	});

	const revealFile = useCallback(
		(path: string) => {
			panel.actions.openFile(path);
			diff.current?.revealFile(path);
		},
		[panel],
	);

	const closeFocus = useCallback(() => {
		panel.actions.clearFocus();
		// Imperative scroll: the overlay uncovers the diff, so put the reading position back where it was.
		requestAnimationFrame(() => diff.current?.restoreReadingPosition());
	}, [panel]);

	const browsing = treeView === "browse";
	const currentSnapshot = generation?.snapshot;
	const files = currentSnapshot?.files ?? [];
	const closedFiles = ReviewDefaultClosure.closedFiles(
		files.map((file) => file.path),
		project.reviewClosedTargets,
		fileClosedOverrides,
	);
	const focusedFile = focusedPath ? files.find((file) => file.path === focusedPath) : undefined;
	const filesClosed = files.length > 0 && files.every((file) => closedFiles.has(file.path));
	const queryClient = useQueryClient();
	const { mutateAsync: setReviewClosedTarget } = useMutation(
		orpc.projects.setReviewClosedTarget.mutationOptions({
			onSuccess: async (_updated, input) => {
				const affectedOverrides = [...panel.state.fileClosedOverrides.keys()].filter((path) =>
					ReviewDefaultClosure.matches([input.target], path),
				);
				panel.actions.clearFileOverrides(affectedOverrides);
				await queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
			},
		}),
	);
	const saveDefaultClosed = async (target: ReviewClosedTarget, closed: boolean) => {
		await setReviewClosedTarget({ projectId: project.id, target, closed });
	};

	const toggleFocus = (path: string) => {
		if (focusedPath === path) {
			closeFocus();
			return;
		}

		panel.actions.focusFile(path);
	};

	const openFromTree = (path: string) => {
		if (focusedPath) {
			panel.actions.focusFile(path);
			return;
		}

		revealFile(path);
	};

	const sharedWith = sharedWorktreeShells({
		shellId,
		worktree,
		shells,
		shellWorktrees: agents.worktrees,
		shellActivity: agents.shells,
	});
	return (
		<aside className="flex bg-surface-raised" aria-label="Review">
			{quickOpen.open && (
				<ReviewQuickOpen
					projectId={project.id}
					worktree={worktree}
					paths={browsePaths ?? []}
					onOpenFile={panel.actions.focusFile}
					onClose={quickOpen.onClose}
				/>
			)}
			{treeOpen && (
				<ReviewTree
					key={worktree}
					files={files}
					browsePaths={browsePaths}
					treeView={treeView}
					focusedPath={focusedPath}
					divider={treeDivider}
					onSelectTreeView={panel.actions.selectTreeView}
					onOpenFile={openFromTree}
					onToggleFocusFile={toggleFocus}
					onCloseFiles={panel.actions.setFilesClosed}
					defaultClosedTargets={project.reviewClosedTargets}
					onSetDefaultClosed={saveDefaultClosed}
				/>
			)}

			<div style={{ width: REVIEW_DIFF_WIDTH_VALUE, minWidth: MIN_DIFF_WIDTH }} className="flex flex-col">
				<ReviewHeader
					mode={mode}
					sharedWith={sharedWith}
					worktrees={worktreeSelection}
					totals={files.length > 0 ? currentSnapshot?.totals : undefined}
					refreshing={refreshing}
					treeOpen={treeOpen}
					expanded={expanded}
					onSelectMode={panel.actions.selectMode}
					onTreeOpenChange={onTreeOpenChange}
					onToggleExpanded={onToggleExpanded}
					filesClosed={filesClosed}
					onToggleAllFiles={() => panel.actions.setFilesClosed(files.map((file) => file.path), !filesClosed)}
				/>

				<div className="relative flex min-h-0 flex-1 flex-col">
					<ReviewDiff
						key={`${mode} ${worktree}`}
						ref={diff}
						mode={mode}
						generation={generation}
						error={error}
						covered={browsing || !!focusedPath}
						closedFiles={closedFiles}
						onToggleOpen={(path) => panel.actions.setFileClosed(path, !closedFiles.has(path))}
						onFocusFile={panel.actions.focusFile}
					/>
					{browsing && !focusedPath && <ReviewBrowseEmpty />}
					{focusedPath && (
						<ReviewFocusedFile
							key={`${focusedPath}:${focusedLine ?? ""}`}
							content={fullFile}
							error={fullFileError}
							path={focusedPath}
							line={focusedLine}
							change={focusedFile}
							onClose={closeFocus}
						/>
					)}
				</div>
			</div>
		</aside>
	);
}
