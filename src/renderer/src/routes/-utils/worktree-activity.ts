import { aggregateActivity, type AgentActivityState } from "@shared/activity";

export function worktreeActivity({
	shellWorktrees,
	shellActivity,
}: {
	shellWorktrees: ReadonlyMap<string, string>;
	shellActivity: ReadonlyMap<string, AgentActivityState>;
}): ReadonlyMap<string, AgentActivityState> {
	const grouped = new Map<string, AgentActivityState[]>();

	for (const [shellId, worktree] of shellWorktrees) {
		const state = shellActivity.get(shellId);
		if (state === undefined) {
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
