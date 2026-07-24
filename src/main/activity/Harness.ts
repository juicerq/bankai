export interface AgentPresence {
	harness: string;
	sessionId: string;
	pid: number;
	procStart: string;
	cwd: string;
	status: "working" | "waiting" | "idle";
}

export interface Harness {
	id: string;
	discover: () => Promise<AgentPresence[]>;
}
