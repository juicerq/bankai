import type { ContinuityShell } from "@shared/continuity";
import type { AgentActivityState } from "@shared/activity";

export function sharedWorktreeShells({
	shellId,
	worktree,
	shells,
	shellWorktrees,
	shellActivity,
}: {
	shellId?: string;
	worktree: string;
	shells: Pick<ContinuityShell, "id" | "label">[];
	shellWorktrees: ReadonlyMap<string, string>;
	shellActivity: ReadonlyMap<string, AgentActivityState>;
}): string[] {
	if (shellId === undefined || shellWorktrees.get(shellId) !== worktree) {
		return [];
	}

	return shells
		.filter((shell) =>
			shell.id !== shellId
			&& shellWorktrees.get(shell.id) === worktree
			&& shellActivity.has(shell.id),
		)
		.map((shell) => shell.label);
}
