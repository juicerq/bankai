import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useRef, useState } from "react";
import type { ContinuityShell } from "@shared/continuity";
import type { Project } from "@shared/projects";
import { orpc } from "@renderer/lib/api";
import { ReviewDiff, type ReviewDiffHandle } from "@renderer/routes/-features/review/reading/review-diff";
import { ReviewFocusedFile } from "@renderer/routes/-features/review/reading/review-focused-file";
import { ReviewHeader } from "@renderer/routes/-features/review/header/review-header";
import { ReviewPathPicker } from "@renderer/routes/-features/review/header/review-path-picker";
import { ReviewTree } from "@renderer/routes/-features/review/tree/review-tree";
import type { ReviewWorktreeSelection } from "@renderer/routes/-features/review/header/review-worktree-menu";
import { MIN_DIFF_WIDTH, REVIEW_DIFF_WIDTH_VALUE } from "@renderer/routes/-features/review/panel/review-layout";
import { createReviewPanelStore } from "@renderer/routes/-features/review/panel/review-panel-store";
import { resolveReviewWorktree } from "@renderer/routes/-features/review/header/review-worktree";
import { sharedWorktreeShells } from "@renderer/routes/-features/review/header/shared-worktree";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { useReviewReading } from "@renderer/routes/-features/review/reading/use-review-reading";
import { worktreeActivity } from "@renderer/routes/-features/review/header/worktree-activity";
import { useWorkspaceAgents, useWorkspaceControl } from "@renderer/routes/-features/workspace/layout/workspace-context";

export function ReviewPanel({
	project,
	shellId,
	shells,
	treeOpen,
	treeDivider,
	expanded,
	onToggleExpanded,
	pathPicker,
}: {
	project: Project;
	shellId?: string;
	shells: ContinuityShell[];
	treeOpen: boolean;
	treeDivider: ReturnType<typeof useDivider>;
	expanded: boolean;
	onToggleExpanded: () => void;
	pathPicker: { open: boolean; onClose: () => void };
}) {
	const { onTreeOpenChange } = useWorkspaceControl();
	const agents = useWorkspaceAgents();
	const shellWorktree = shellId === undefined ? undefined : agents.worktrees.get(shellId);
	const [panel] = useState(createReviewPanelStore);
	const mode = useSelector(panel, (state) => state.mode);
	const treeView = useSelector(panel, (state) => state.treeView);
	const closedFiles = useSelector(panel, (state) => state.closedFiles);
	const focusedPath = useSelector(panel, (state) => state.focusedPath);
	const pinnedWorktree = useSelector(panel, (state) => state.pinnedWorktree);
	const diff = useRef<ReviewDiffHandle>(null);
	const isFileOpen = useCallback((path: string) => !closedFiles.has(path), [closedFiles]);

	const queryClient = useQueryClient();
	const worktreesQuery = useQuery(orpc.review.worktrees.queryOptions({ input: { projectId: project.id } }));
	const removeWorktree = useMutation(
		orpc.review.removeWorktree.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: orpc.review.worktrees.key() });
			},
		}),
	);
	const worktrees = worktreesQuery.data ?? [];
	const worktree = resolveReviewWorktree({ pinned: pinnedWorktree, shellWorktree, worktrees }) ?? project.path;

	const { data: browsePaths } = useQuery(
		orpc.review.browseFiles.queryOptions({
			input: { projectId: project.id, worktree },
			enabled: pathPicker.open || (treeOpen && treeView === "browse"),
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

	const currentSnapshot = generation?.snapshot;
	const files = currentSnapshot?.files ?? [];
	const focusedFile = focusedPath ? files.find((file) => file.path === focusedPath) : undefined;
	const filesClosed = files.length > 0 && files.every((file) => closedFiles.has(file.path));

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
	const worktreeSelection: ReviewWorktreeSelection = {
		worktrees,
		activePath: worktree,
		mainPath: project.path,
		pinnedPath: worktree === pinnedWorktree ? pinnedWorktree : undefined,
		shellPath: shellWorktree,
		activity: worktreeActivity({ shellWorktrees: agents.worktrees, shellActivity: agents.shells }),
		removeFailure:
			removeWorktree.error && removeWorktree.variables
				? { path: removeWorktree.variables.worktree, message: removeWorktree.error.message }
				: undefined,
		onSelect: panel.actions.pinWorktree,
		onRemove: (path) => removeWorktree.mutate({ projectId: project.id, worktree: path }),
	};

	return (
		<aside className="flex bg-surface-raised" aria-label="Review">
			{pathPicker.open && (
				<ReviewPathPicker paths={browsePaths ?? []} onOpenFile={panel.actions.focusFile} onClose={pathPicker.onClose} />
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
					onCloseFiles={panel.actions.closeScope}
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
					onToggleAllFiles={() => panel.actions.closeScope(files.map((file) => file.path), !filesClosed)}
				/>

				<div className="relative flex min-h-0 flex-1 flex-col">
					<ReviewDiff
						key={`${mode} ${worktree}`}
						ref={diff}
						mode={mode}
						generation={generation}
						error={error}
						covered={!!focusedPath}
						closedFiles={closedFiles}
						onToggleOpen={panel.actions.toggleFile}
						onFocusFile={panel.actions.focusFile}
					/>
					{focusedPath && (
						<ReviewFocusedFile
							key={focusedPath}
							content={fullFile}
							error={fullFileError}
							path={focusedPath}
							change={focusedFile}
							onClose={closeFocus}
						/>
					)}
				</div>
			</div>
		</aside>
	);
}
