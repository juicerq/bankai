import { aggregateActivity, type AgentActivityState } from "@shared/activity";

export function worktreeActivity({
	sessionIds,
	shellWorktrees,
	shellActivity,
}: {
	sessionIds: Record<string, string>;
	shellWorktrees: ReadonlyMap<string, string>;
	shellActivity: ReadonlyMap<string, AgentActivityState>;
}): ReadonlyMap<string, AgentActivityState> {
	const grouped = new Map<string, AgentActivityState[]>();

	for (const [shellId, sessionId] of Object.entries(sessionIds)) {
		const worktree = shellWorktrees.get(shellId);
		const state = shellActivity.get(sessionId);
		if (worktree === undefined || state === undefined) {
			continue;
		}

		grouped.set(worktree, [...(grouped.get(worktree) ?? []), state]);
	}

	const activity = new Map<string, AgentActivityState>();

	for (const [worktree, states] of grouped) {
		const state = aggregateActivity(states);
		if (state !== null) {
			activity.set(worktree, state);
		}
	}

	return activity;
}
