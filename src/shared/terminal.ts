export interface TerminalEvent {
	sessionId: string;
	data: string;
}

export interface TerminalExitEvent {
	sessionId: string;
	exitCode: number;
}

export interface TerminalCommandErrorEvent {
	sessionId: string;
	command: "write" | "resize" | "close";
	error: string;
}

export interface BankaiTerminalApi {
	open: (projectId: string, shellId: string, cols: number, rows: number) => Promise<string>;
	resume: (projectId: string, shellId: string, cols: number, rows: number) => Promise<string>;
	write: (sessionId: string, data: string) => void;
	resize: (sessionId: string, cols: number, rows: number) => void;
	close: (sessionId: string) => void;
	onData: (listener: (event: TerminalEvent) => void) => () => void;
	onExit: (listener: (event: TerminalExitEvent) => void) => () => void;
	onCommandError: (listener: (event: TerminalCommandErrorEvent) => void) => () => void;
}

declare global {
	interface Window {
		bankaiTerminal: BankaiTerminalApi;
	}
}
