export const REVIEW_UNAVAILABLE_REASONS = [
	"historical",
	"unsafe",
	"tool-conflict",
] as const;
export type ReviewUnavailableReason = typeof REVIEW_UNAVAILABLE_REASONS[number];

export type TranscriptEvent =
	| { type: "prompt"; prompt: string }
	| { type: "change"; path: string; before: string; after: string }
	| { type: "complete" }
	| { type: "unavailable"; reason: ReviewUnavailableReason };

export type NativeSessionRecord = {
	pid: number;
	sessionId: string;
	procStart: string;
	kind?: "interactive";
};

export type HarnessDiscovery = {
	discover(): Promise<NativeSessionRecord[]>;
};

export type HarnessTranscript = {
	historicalImport: "safe" | "observed-only" | "eligible-only";
	locateMany(sessionIds: Set<string>): Promise<Map<string, string>>;
	normalize(records: unknown[], sessionId: string): Promise<TranscriptEvent[] | null>;
};

export type HarnessLaunch = {
	resume(sessionId: string, argv?: string[]): string[];
	fresh(argv?: string[]): string[] | null;
};

export type HarnessIntegration = {
	id: string;
	discovery: HarnessDiscovery;
	transcript: HarnessTranscript;
	launch: HarnessLaunch;
};
