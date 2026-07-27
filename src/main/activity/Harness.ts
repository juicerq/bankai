export interface AgentPresence {
	harness: string;
	sessionId: string;
	pid: number;
	procStart: string;
	cwd: string;
	status: "working" | "waiting" | "idle";
	statusSince?: number;
	waitingFor?: string;
}

export interface HarnessCommand {
	file: string;
	args: string[];
}

export interface HarnessTrace {
	label: string;
	recordId: string;
	since?: number;
}

export interface Harness {
	id: string;
	label: string;
	discover: () => Promise<AgentPresence[]>;
	launch?: () => HarnessCommand;
	resume?: (ref: { sessionId: string }) => HarnessCommand | null;
	title?: (ref: { sessionId: string; cwd: string }) => Promise<string | null>;
	trace?: (ref: { sessionId: string; cwd: string }) => Promise<HarnessTrace | null>;
}
