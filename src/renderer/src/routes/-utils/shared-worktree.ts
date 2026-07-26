import type { AgentActivityState } from "@shared/activity";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";

export function sharedWorktreeShells({
	shellId,
	worktree,
	tabs,
	shellWorktrees,
	shellActivity,
}: {
	shellId?: string;
	worktree: string;
	tabs: ShellTab[];
	shellWorktrees: ReadonlyMap<string, string>;
	shellActivity: ReadonlyMap<string, AgentActivityState>;
}): string[] {
	if (shellId === undefined || shellWorktrees.get(shellId) !== worktree) {
		return [];
	}

	return tabs
		.filter((tab) =>
			tab.id !== shellId
			&& shellWorktrees.get(tab.id) === worktree
			&& shellActivity.has(tab.id),
		)
		.map((tab) => tab.label);
}
