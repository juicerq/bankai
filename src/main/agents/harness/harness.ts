import type { ConversationBlock } from "@shared/conversation";

export const CLAUDE_HARNESS_ID = "claude";

export const CODEX_HARNESS_ID = "codex";

export interface AgentPresence {
	harness: string;
	sessionId?: string;
	pid: number;
	procStart: string;
	cwd: string;
	status: "working" | "waiting" | "idle";
	statusSince?: number;
}

export interface HarnessCommand {
	file: string;
	args: string[];
}

export interface ConversationLineParser {
	title: string | undefined;
	consume: (line: string) => ConversationBlock[];
}

export interface Harness {
	id: string;
	label: string;
	conversation?: {
		transcript: (ref: { sessionId: string; cwd: string }) => Promise<string | null>;
		parser: () => ConversationLineParser;
		subagentTranscript?: (ref: { sessionId: string; cwd: string }, agent: string) => Promise<string | undefined>;
	};
	discover: () => Promise<AgentPresence[]>;
	launch?: () => HarnessCommand;
	resume?: (ref: { sessionId: string }) => HarnessCommand | null;
	title?: (ref: { sessionId: string; cwd: string }) => Promise<string | null>;
	watch?: () => string[];
}
