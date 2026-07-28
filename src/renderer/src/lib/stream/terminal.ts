import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiTerminalApi, TerminalAttached } from "@shared/terminal";

export const terminalStream: BankaiTerminalApi = {
	open: (projectId, shellId, cols, rows) =>
		streamSocket.request<TerminalAttached>("terminal", "open", { projectId, shellId, cols, rows }),
	resume: (projectId, shellId, cols, rows) =>
		streamSocket.request<TerminalAttached>("terminal", "resume", { projectId, shellId, cols, rows }),
	write: (sessionId, data) => streamSocket.send("terminal", "write", { sessionId, data }),
	resize: (sessionId, cols, rows) => streamSocket.send("terminal", "resize", { sessionId, cols, rows }),
	close: (sessionId) => streamSocket.send("terminal", "close", { sessionId }),
	detach: (sessionId) => streamSocket.send("terminal", "detach", { sessionId }),
	onData: (listener) => streamSocket.on("terminal", "data", listener),
	onExit: (listener) => streamSocket.on("terminal", "exit", listener),
	onCommandError: (listener) => streamSocket.on("terminal", "command-error", listener),
};
