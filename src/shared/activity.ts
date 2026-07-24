export const ACTIVITY_IPC = {
	watch: "activity:watch",
	unwatch: "activity:unwatch",
	changed: "activity:changed",
	viewed: "activity:viewed",
} as const;

export type AgentActivityState = "working" | "needs-attention" | "done-unseen";

export interface ProjectActivitySnapshot {
	state: AgentActivityState | null;
	shells: Record<string, AgentActivityState>;
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
