interface TerminalEvent {
	sessionId: string;
	data: string;
}

interface TerminalExitEvent {
	sessionId: string;
	exitCode: number;
}

export interface TerminalCommandErrorEvent {
	sessionId: string;
	command: "write" | "resize" | "close";
	error: string;
}

export type TerminalStreamEvent =
	| { type: "data"; payload: TerminalEvent }
	| { type: "exit"; payload: TerminalExitEvent };

export interface TerminalAttached {
	sessionId: string;
	replay?: string;
}

export interface BankaiTerminalApi {
	open: (projectId: string, shellId: string, cols: number, rows: number) => Promise<TerminalAttached>;
	resume: (projectId: string, shellId: string, cols: number, rows: number) => Promise<TerminalAttached>;
	write: (sessionId: string, data: string) => void;
	resize: (sessionId: string, cols: number, rows: number) => void;
	close: (sessionId: string) => void;
	detach: (sessionId: string) => void;
	onData: (listener: (event: TerminalEvent) => void) => () => void;
	onExit: (listener: (event: TerminalExitEvent) => void) => () => void;
	onCommandError: (listener: (event: TerminalCommandErrorEvent) => void) => () => void;
}
