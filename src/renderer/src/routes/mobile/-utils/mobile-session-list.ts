import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { partitionSessions, type SessionRow } from "@renderer/routes/-utils/session-rows";

const ATTENTION_RANK: Record<AgentActivityState, number> = {
	"needs-attention": 0,
	working: 1,
	"done-unseen": 2,
};

const IDLE_RANK = 3;

function attentionRank(activity: AgentActivityState | undefined): number {
	if (!activity) {
		return IDLE_RANK;
	}

	return ATTENTION_RANK[activity];
}

export function mobileSessionList({
	rows,
	projects,
	chosenProjectIds,
	now,
}: {
	rows: SessionRow[];
	projects: Project[];
	chosenProjectIds: ReadonlySet<string>;
	now: number;
}): {
	sessions: SessionRow[];
	projects: Project[];
	projectActivity: ReadonlyMap<string, AgentActivityState>;
} {
	const { open } = partitionSessions(rows, now);
	const narrowed = chosenProjectIds.size === 0
		? open
		: open.filter((row) => chosenProjectIds.has(row.projectId));

	return {
		sessions: narrowed.sort((left, right) => attentionRank(left.activity) - attentionRank(right.activity)),
		projects: [...projects].sort((left, right) => left.name.localeCompare(right.name)),
		projectActivity: topActivityByProject(open),
	};
}

function topActivityByProject(rows: SessionRow[]): ReadonlyMap<string, AgentActivityState> {
	const top = new Map<string, AgentActivityState>();

	for (const row of rows) {
		if (!row.activity) {
			continue;
		}

		const current = top.get(row.projectId);
		if (!current || attentionRank(row.activity) < attentionRank(current)) {
			top.set(row.projectId, row.activity);
		}
	}

	return top;
}
