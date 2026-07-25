import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { ReviewMode } from "@main/git/contracts";
import type { Project } from "@main/store/projects";
import { orpc } from "@renderer/lib/api";
import { ReviewDiff, type ReviewDiffHandle } from "@renderer/routes/-components/review-diff";
import { ReviewFocusedFile } from "@renderer/routes/-components/review-focused-file";
import { ReviewHeader } from "@renderer/routes/-components/review-header";
import { ReviewTree } from "@renderer/routes/-components/review-tree";
import type { ReviewWorktreeSelection } from "@renderer/routes/-components/review-worktree";
import { REVIEW_DIFF_WIDTH_VALUE } from "@renderer/routes/-utils/review-layout";
import { resolveReviewWorktree } from "@renderer/routes/-utils/review-worktree";
import { toggledSet } from "@renderer/routes/-utils/toggled-set";
import type { useDivider } from "@renderer/routes/-utils/use-divider";
import { useReviewReading } from "@renderer/routes/-utils/use-review-reading";

export function ReviewPanel({
	project,
	shellId,
	shellWorktree,
	minDiffWidth,
	treeOpen,
	treeDivider,
	onTreeOpenChange,
	onClose,
}: {
	project: Project;
	shellId?: string;
	shellWorktree?: string;
	minDiffWidth: number;
	treeOpen: boolean;
	treeDivider: ReturnType<typeof useDivider>;
	onTreeOpenChange: (open: boolean) => void;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<ReviewMode>("last-turn");
	const [closedFiles, setClosedFiles] = useState<ReadonlySet<string>>(new Set());
	const [focusedPath, setFocusedPath] = useState<string>();
	const [pinnedWorktree, setPinnedWorktree] = useState<string>();
	const diff = useRef<ReviewDiffHandle>(null);
	const isFileOpen = useCallback((path: string) => !closedFiles.has(path), [closedFiles]);

	const worktreesQuery = useQuery(orpc.review.worktrees.queryOptions({ input: { projectId: project.id } }));
	const worktrees = worktreesQuery.data ?? [];
	if (pinnedWorktree && worktrees.length > 0 && !worktrees.some((worktree) => worktree.path === pinnedWorktree)) {
		setPinnedWorktree(undefined);
	}
	const worktree = resolveReviewWorktree({ pinned: pinnedWorktree, shellWorktree, worktrees }) ?? project.path;

	const { generation, fullFile, error, refreshing } = useReviewReading({
		projectId: project.id,
		worktree,
		mode,
		shellId,
		isFileOpen,
		focusedPath,
	});

	const selectMode = useCallback((next: ReviewMode) => {
		setMode(next);
		setFocusedPath(undefined);
	}, []);

	const selectWorktree = useCallback((next: string | undefined) => {
		setPinnedWorktree(next);
		setFocusedPath(undefined);
	}, []);

	const revealFile = useCallback((path: string) => {
		setClosedFiles((current) => {
			const next = new Set(current);
			next.delete(path);
			return next;
		});
		diff.current?.revealFile(path);
	}, []);

	const toggleOpen = useCallback((path: string) => {
		setClosedFiles((current) => toggledSet(current, path));
	}, []);

	const closeFocus = useCallback(() => {
		setFocusedPath(undefined);
		// Imperative scroll: the overlay uncovers the diff, so put the reading position back where it was.
		requestAnimationFrame(() => diff.current?.restoreReadingPosition());
	}, []);

	const toggleFocus = useCallback(
		(path: string) => {
			if (focusedPath === path) {
				closeFocus();
				return;
			}
			setFocusedPath(path);
		},
		[focusedPath, closeFocus],
	);

	const openFromTree = useCallback(
		(path: string) => {
			if (focusedPath) {
				setFocusedPath(path);
				return;
			}
			revealFile(path);
		},
		[focusedPath, revealFile],
	);

	const currentSnapshot = generation?.snapshot;
	const files = currentSnapshot?.files ?? [];
	const focusedFile = focusedPath ? files.find((file) => file.path === focusedPath) : undefined;
	if (focusedPath && currentSnapshot && !focusedFile) {
		// A focused path is only valid while the snapshot still contains it; drop it when the file leaves the scope.
		setFocusedPath(undefined);
	}

	const setScopeClosed = (closed: boolean) => {
		if (files.every((file) => closedFiles.has(file.path) === closed)) {
			return;
		}
		setClosedFiles((current) => {
			const next = new Set(current);
			for (const file of files) {
				if (closed) {
					next.add(file.path);
				} else {
					next.delete(file.path);
				}
			}
			return next;
		});
	};

	const readingKey = `${mode} ${worktree}`;
	const worktreeSelection: ReviewWorktreeSelection = {
		worktrees,
		activePath: worktree,
		pinnedPath: pinnedWorktree,
		shellPath: shellWorktree,
		onSelect: selectWorktree,
	};

	return (
		<aside className="flex bg-surface-raised" aria-label="Review">
			{treeOpen && (
				<ReviewTree
					key={readingKey}
					files={files}
					focusedPath={focusedPath}
					divider={treeDivider}
					onOpenFile={openFromTree}
					onToggleFocusFile={toggleFocus}
				/>
			)}

			<div style={{ width: REVIEW_DIFF_WIDTH_VALUE, minWidth: minDiffWidth }} className="flex flex-col">
				<ReviewHeader
					mode={mode}
					worktrees={worktreeSelection}
					totals={currentSnapshot?.state === "ready" ? currentSnapshot.totals : undefined}
					refreshing={refreshing}
					treeOpen={treeOpen}
					onSelectMode={selectMode}
					onTreeOpenChange={onTreeOpenChange}
					onCollapseAll={() => setScopeClosed(true)}
					onExpandAll={() => setScopeClosed(false)}
					onClose={onClose}
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
						onToggleOpen={toggleOpen}
						onFocusFile={setFocusedPath}
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
