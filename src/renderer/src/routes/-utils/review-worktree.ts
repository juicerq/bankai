import type { Worktree } from "@main/git/contracts";

export function worktreeLabel(worktree: Worktree): string {
	return worktree.branch ?? worktree.path.split("/").filter(Boolean).at(-1) ?? worktree.path;
}

export function resolveReviewWorktree(input: {
	pinned?: string;
	shellWorktree?: string;
	worktrees: Worktree[];
}): string | undefined {
	const listed = (path: string | undefined) =>
		!!path && (input.worktrees.length === 0 || input.worktrees.some((worktree) => worktree.path === path));

	if (listed(input.pinned)) {
		return input.pinned;
	}
	if (listed(input.shellWorktree)) {
		return input.shellWorktree;
	}

	return undefined;
}
