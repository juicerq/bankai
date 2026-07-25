import type { AgentActivityState } from "@shared/activity";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";

export function sharedWorktreeShells({
	shellId,
	worktree,
	tabs,
	sessionIds,
	shellWorktrees,
	shellActivity,
}: {
	shellId?: string;
	worktree: string;
	tabs: ShellTab[];
	sessionIds: Record<string, string>;
	shellWorktrees: ReadonlyMap<string, string>;
	shellActivity: ReadonlyMap<string, AgentActivityState>;
}): string[] {
	if (shellId === undefined || shellWorktrees.get(shellId) !== worktree) {
		return [];
	}

	return tabs
		.filter((tab) => {
			const sessionId = sessionIds[tab.id];

			return tab.id !== shellId
				&& shellWorktrees.get(tab.id) === worktree
				&& !!sessionId
				&& shellActivity.has(sessionId);
		})
		.map((tab) => tab.label);
}
