export interface AgentPresence {
	harness: string;
	sessionId?: string;
	pid: number;
	procStart: string;
	cwd: string;
	status: "working" | "waiting" | "idle";
	statusSince?: number;
	publishedName?: string;
}

export interface HarnessCommand {
	file: string;
	args: string[];
}

export interface Harness {
	id: string;
	label: string;
	conversation: boolean;
	discover: () => Promise<AgentPresence[]>;
	launch?: () => HarnessCommand;
	resume?: (ref: { sessionId: string }) => HarnessCommand | null;
	title?: (ref: { sessionId: string; cwd: string }) => Promise<string | null>;
	proposeName?: (ref: { sessionId: string; cwd: string }) => Promise<string | null>;
	watch?: () => string[];
}
