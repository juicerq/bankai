export type AgentActivityState = "working" | "needs-attention" | "done";

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

export interface ProjectActivitySnapshot {
	shells: Record<string, AgentActivityState>;
	worktreeByShellId: Record<string, string>;
	statusSinceByShellId: Record<string, number>;
	harnessByShellId: Record<string, string>;
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
