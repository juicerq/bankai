import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiTerminalApi, TerminalAttached } from "@shared/terminal";

export const terminalStream: BankaiTerminalApi = {
	open: (projectId, shellId, cols, rows) =>
		streamSocket.request<TerminalAttached>("terminal", "open", { projectId, shellId, cols, rows }),
	resume: (projectId, shellId, cols, rows) =>
		streamSocket.request<TerminalAttached>("terminal", "resume", { projectId, shellId, cols, rows }),
	attach: (projectId, shellId) =>
		streamSocket.request<TerminalAttached>("terminal", "attach", { projectId, shellId }),
	write: (sessionId, data) => streamSocket.send("terminal", "write", { sessionId, data }),
	resize: (sessionId, cols, rows) => streamSocket.send("terminal", "resize", { sessionId, cols, rows }),
	close: (sessionId) => streamSocket.send("terminal", "close", { sessionId }),
	detach: (sessionId) => streamSocket.send("terminal", "detach", { sessionId }),
	prompt: (projectId, shellId, text) => streamSocket.request("terminal", "prompt", { projectId, shellId, text }),
	key: (projectId, shellId, key) => streamSocket.request("terminal", "key", { projectId, shellId, key }),
	onData: (listener) => streamSocket.on("terminal", "data", listener),
	onExit: (listener) => streamSocket.on("terminal", "exit", listener),
	onCommandError: (listener) => streamSocket.on("terminal", "command-error", listener),
};
