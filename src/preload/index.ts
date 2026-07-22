import { contextBridge, ipcRenderer } from "electron";
import type {
	BankaiTerminalApi,
	TerminalCommandErrorEvent,
	TerminalEvent,
	TerminalExitEvent,
} from "@shared/terminal";
import type { BankaiWindowApi } from "@shared/window";

window.addEventListener("message", (event) => {
	if (event.source !== window || event.data !== "start-orpc-client") {
		return;
	}
	const [port] = event.ports;
	if (!port) {
		return;
	}
	ipcRenderer.postMessage("start-orpc-server", null, [port]);
});

const terminalApi: BankaiTerminalApi = {
	open: (projectId, cols, rows) =>
		ipcRenderer.invoke("terminal:open", { projectId, cols, rows }),
	write: (sessionId, data) => ipcRenderer.send("terminal:write", { sessionId, data }),
	resize: (sessionId, cols, rows) => ipcRenderer.send("terminal:resize", { sessionId, cols, rows }),
	close: (sessionId) => ipcRenderer.send("terminal:close", { sessionId }),
	onData: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: TerminalEvent) => {
			listener(payload);
		};
		ipcRenderer.on("terminal:data", handler);
		return () => ipcRenderer.removeListener("terminal:data", handler);
	},
	onExit: (listener) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			payload: TerminalExitEvent,
		) => {
			listener(payload);
		};
		ipcRenderer.on("terminal:exit", handler);
		return () => ipcRenderer.removeListener("terminal:exit", handler);
	},
	onCommandError: (listener) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			payload: TerminalCommandErrorEvent,
		) => {
			listener(payload);
		};
		ipcRenderer.on("terminal:command-error", handler);
		return () => ipcRenderer.removeListener("terminal:command-error", handler);
	},
};

contextBridge.exposeInMainWorld("bankaiTerminal", terminalApi);

const windowApi: BankaiWindowApi = {
	minimize: () => ipcRenderer.send("window:minimize"),
	toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
	close: () => ipcRenderer.send("window:close"),
};

contextBridge.exposeInMainWorld("bankaiWindow", windowApi);
