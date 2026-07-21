export type TerminalEvent = {
	sessionId: string;
	data: string;
};

export type TerminalExitEvent = {
	sessionId: string;
	exitCode: number;
};

export type BankaiTerminalApi = {
	open: (projectId: string, cols: number, rows: number) => Promise<string>;
	write: (sessionId: string, data: string) => Promise<void>;
	resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
	close: (sessionId: string) => Promise<void>;
	onData: (listener: (event: TerminalEvent) => void) => () => void;
	onExit: (listener: (event: TerminalExitEvent) => void) => () => void;
};

declare global {
	interface Window {
		bankaiTerminal: BankaiTerminalApi;
	}
}
