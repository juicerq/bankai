export type AgentActivityState = "working" | "needs-attention" | "done";

export const DEFAULT_LIVE_TRACE = true;

export const DEFAULT_SESSION_NAMING = true;

const AGGREGATE_PRIORITY: AgentActivityState[] = ["needs-attention", "done", "working"];

export function aggregateActivity(states: AgentActivityState[]): AgentActivityState | null {
	for (const priority of AGGREGATE_PRIORITY) {
		if (states.includes(priority)) {
			return priority;
		}
	}

	return null;
}

export interface ShellAttention {
	message: string;
	at: number;
	detail?: string;
}

export interface ProjectActivitySnapshot {
	shells: Record<string, AgentActivityState>;
	worktreeByShellId: Record<string, string>;
	traceByShellId: Record<string, string>;
	traceSinceByShellId: Record<string, number>;
	statusSinceByShellId: Record<string, number>;
	attentionByShellId: Record<string, ShellAttention>;
}

export interface ActivityChangedEvent extends ProjectActivitySnapshot {
	projectId: string;
}

export interface BankaiActivityApi {
	watch: (projectId: string) => Promise<ProjectActivitySnapshot>;
	unwatch: (projectId: string) => void;
	onChanged: (listener: (event: ActivityChangedEvent) => void) => () => void;
	focusShell: (shellId?: string) => void;
}
