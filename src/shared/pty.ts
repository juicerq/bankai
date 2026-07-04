export const PTY_DATA = "pty:data";
export const PTY_EXIT = "pty:exit";
export const PTY_INPUT = "pty:input";
export const PTY_RESIZE = "pty:resize";

export type PtyData = { sessionId: string; chunk: string };
export type PtyExit = { sessionId: string; exitCode: number };
export type PtyInput = { sessionId: string; data: string };
export type PtyResize = { sessionId: string; cols: number; rows: number };

export type PtyBridge = {
	onData(sessionId: string, cb: (chunk: string) => void): () => void;
	onExit(sessionId: string, cb: (exitCode: number) => void): () => void;
	input(sessionId: string, data: string): void;
	resize(sessionId: string, cols: number, rows: number): void;
};
