export type TranscriptEvent =
	| { type: "prompt"; prompt: string }
	| { type: "change"; path: string; before: string; after: string }
	| { type: "complete" };

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
	historicalImport: "safe" | "observed-only";
	locateMany(sessionIds: Set<string>): Promise<Map<string, string>>;
	normalize(records: unknown[]): Promise<TranscriptEvent[] | null>;
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
