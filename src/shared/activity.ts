export const ACTIVITY_IPC = {
	watch: "activity:watch",
	unwatch: "activity:unwatch",
	changed: "activity:changed",
	viewed: "activity:viewed",
} as const;

export type AgentActivityState = "working" | "needs-attention" | "done-unseen";

const AGGREGATE_PRIORITY: AgentActivityState[] = ["needs-attention", "done-unseen", "working"];

export function aggregateActivity(states: AgentActivityState[]): AgentActivityState | null {
	for (const priority of AGGREGATE_PRIORITY) {
		if (states.includes(priority)) {
			return priority;
		}
	}

	return null;
}

export interface ProjectActivitySnapshot {
	shells: Record<string, AgentActivityState>;
	worktreeByShellId: Record<string, string>;
	traceByShellId: Record<string, string>;
	traceSinceByShellId: Record<string, number>;
	statusSinceByShellId: Record<string, number>;
}

export interface ActivityChangedEvent extends ProjectActivitySnapshot {
	projectId: string;
}

export interface BankaiActivityApi {
	watch: (projectId: string) => Promise<ProjectActivitySnapshot>;
	unwatch: (projectId: string) => void;
	onChanged: (listener: (event: ActivityChangedEvent) => void) => () => void;
	markViewed: (sessionId: string) => void;
}

declare global {
	interface Window {
		bankaiActivity: BankaiActivityApi;
	}
}
