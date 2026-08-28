import { streamSocket } from "@renderer/lib/stream/socket";
import { streamVoidSchema } from "@shared/stream";
import {
	type BankaiTerminalApi,
	terminalAttachedSchema,
	terminalCommandErrorEventSchema,
	terminalDataEventSchema,
	terminalExitEventSchema,
} from "@shared/terminal";

export const terminalStream: BankaiTerminalApi = {
	open: (projectId, shellId, cols, rows) =>
		streamSocket.request("terminal", "open", { projectId, shellId, cols, rows }, terminalAttachedSchema),
	resume: (projectId, shellId, cols, rows) =>
		streamSocket.request("terminal", "resume", { projectId, shellId, cols, rows }, terminalAttachedSchema),
	attach: (projectId, shellId) =>
		streamSocket.request("terminal", "attach", { projectId, shellId }, terminalAttachedSchema),
	write: (sessionId, data) => streamSocket.send("terminal", "write", { sessionId, data }),
	resize: (sessionId, cols, rows) => streamSocket.send("terminal", "resize", { sessionId, cols, rows }),
	close: (sessionId) => streamSocket.send("terminal", "close", { sessionId }),
	detach: (sessionId) => streamSocket.send("terminal", "detach", { sessionId }),
	prompt: (projectId, shellId, text) =>
		streamSocket.request("terminal", "prompt", { projectId, shellId, text }, streamVoidSchema),
	key: (projectId, shellId, key) =>
		streamSocket.request("terminal", "key", { projectId, shellId, key }, streamVoidSchema),
	onData: (listener) => streamSocket.on("terminal", "data", terminalDataEventSchema, listener),
	onExit: (listener) => streamSocket.on("terminal", "exit", terminalExitEventSchema, listener),
	onCommandError: (listener) =>
		streamSocket.on("terminal", "command-error", terminalCommandErrorEventSchema, listener),
};
