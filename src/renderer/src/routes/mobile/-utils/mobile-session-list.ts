import type { Project } from "@shared/projects";
import type { AgentActivityState } from "@shared/activity";
import { partitionSessions, type SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";

const ATTENTION_RANK: Record<AgentActivityState, number> = {
	"needs-attention": 0,
	working: 2,
	"done": 3,
};

const PINNED_RANK = 1;
const IDLE_RANK = 4;

function attentionRank(activity: AgentActivityState | undefined): number {
	if (!activity) {
		return IDLE_RANK;
	}

	return ATTENTION_RANK[activity];
}

function listRank(row: SessionRow): number {
	const attention = attentionRank(row.activity);

	if (row.pinnedAt === undefined) {
		return attention;
	}

	return Math.min(attention, PINNED_RANK);
}

export function mobileSessionList({
	rows,
	projects,
	includesProject,
	now,
}: {
	rows: SessionRow[];
	projects: Project[];
	includesProject: (projectId: string) => boolean;
	now: number;
}): {
	sessions: SessionRow[];
	archived: SessionRow[];
	projects: Project[];
	projectActivity: ReadonlyMap<string, AgentActivityState>;
} {
	const { open, archived } = partitionSessions(rows, now);
	const listed = (row: SessionRow) => includesProject(row.projectId);

	return {
		sessions: open.filter(listed).sort((left, right) => listRank(left) - listRank(right)),
		archived: archived.filter(listed),
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
