import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { orpc } from "@renderer/lib/api";
import { ReviewDiff, type ReviewDiffHandle } from "@renderer/routes/-components/review-diff";
import { ReviewFocusedFile } from "@renderer/routes/-components/review-focused-file";
import { ReviewHeader } from "@renderer/routes/-components/review-header";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import type { ReviewWorktreeSelection } from "@renderer/routes/-components/review-worktree";
import { REVIEW_DIFF_WIDTH_VALUE } from "@renderer/routes/-utils/review-layout";
import { createReviewPanelStore } from "@renderer/routes/-utils/review-panel-store";
import { resolveReviewWorktree } from "@renderer/routes/-utils/review-worktree";
import type { useDivider } from "@renderer/routes/-utils/use-divider";
import { useReviewReading } from "@renderer/routes/-utils/use-review-reading";

export function ReviewPanel({
	project,
	shellId,
	shellWorktree,
	worktreeActivity,
	minDiffWidth,
	treeOpen,
	treeDivider,
	onTreeOpenChange,
}: {
	project: Project;
	shellId?: string;
	shellWorktree?: string;
	worktreeActivity: ReadonlyMap<string, AgentActivityState>;
	minDiffWidth: number;
	treeOpen: boolean;
	treeDivider: ReturnType<typeof useDivider>;
	onTreeOpenChange: (open: boolean) => void;
}) {
	const [panel] = useState(createReviewPanelStore);
	const mode = useSelector(panel, (state) => state.mode);
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

	const { generation, fullFile, error, refreshing } = useReviewReading({
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
		if (focusedFile?.path === path) {
			closeFocus();
			return;
		}

		panel.actions.focusFile(path);
	};

	const openFromTree = (path: string) => {
		if (focusedFile) {
			panel.actions.focusFile(path);
			return;
		}

		revealFile(path);
	};

	const readingKey = `${mode} ${worktree}`;
	const worktreeSelection: ReviewWorktreeSelection = {
		worktrees,
		activePath: worktree,
		mainPath: project.path,
		pinnedPath: worktree === pinnedWorktree ? pinnedWorktree : undefined,
		shellPath: shellWorktree,
		activity: worktreeActivity,
		removeFailure:
			removeWorktree.error && removeWorktree.variables
				? { path: removeWorktree.variables.worktree, message: removeWorktree.error.message }
				: undefined,
		onSelect: panel.actions.pinWorktree,
		onRemove: (path) => removeWorktree.mutate({ projectId: project.id, worktree: path }),
	};

	return (
		<aside className="flex bg-surface-raised" aria-label="Review">
			{treeOpen && (
				<ReviewTree
					key={readingKey}
					files={files}
					focusedPath={focusedFile?.path}
					divider={treeDivider}
					onOpenFile={openFromTree}
					onToggleFocusFile={toggleFocus}
				/>
			)}

			<div style={{ width: REVIEW_DIFF_WIDTH_VALUE, minWidth: minDiffWidth }} className="flex flex-col">
				<ReviewHeader
					mode={mode}
					worktrees={worktreeSelection}
					totals={files.length > 0 ? currentSnapshot?.totals : undefined}
					refreshing={refreshing}
					treeOpen={treeOpen}
					onSelectMode={panel.actions.selectMode}
					onTreeOpenChange={onTreeOpenChange}
					filesClosed={filesClosed}
					onToggleAllFiles={() => panel.actions.closeScope(files.map((file) => file.path), !filesClosed)}
				/>

				<div className="relative flex min-h-0 flex-1 flex-col">
					<ReviewDiff
						key={readingKey}
						ref={diff}
						mode={mode}
						generation={generation}
						error={error}
						covered={!!focusedFile}
						closedFiles={closedFiles}
						onToggleOpen={panel.actions.toggleFile}
						onFocusFile={panel.actions.focusFile}
					/>
					{focusedFile && (
						<ReviewFocusedFile
							key={focusedFile.path}
							content={fullFile}
							file={focusedFile}
							onClose={closeFocus}
						/>
					)}
				</div>
			</div>
		</aside>
	);
}
