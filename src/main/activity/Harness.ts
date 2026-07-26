export interface AgentPresence {
	harness: string;
	sessionId: string;
	pid: number;
	procStart: string;
	cwd: string;
	status: "working" | "waiting" | "idle";
}

export interface ResumeCommand {
	file: string;
	args: string[];
}

export interface Harness {
	id: string;
	discover: () => Promise<AgentPresence[]>;
	resume?: (ref: { sessionId: string }) => ResumeCommand | null;
	title?: (ref: { sessionId: string; cwd: string }) => Promise<string | null>;
}
