import { contextBridge, ipcRenderer } from "electron";
import type {
	BankaiTerminalApi,
	TerminalEvent,
	TerminalExitEvent,
} from "@shared/terminal";

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
	write: (sessionId, data) => ipcRenderer.invoke("terminal:write", { sessionId, data }),
	resize: (sessionId, cols, rows) => ipcRenderer.invoke("terminal:resize", { sessionId, cols, rows }),
	close: (sessionId) => ipcRenderer.invoke("terminal:close", { sessionId }),
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
};

contextBridge.exposeInMainWorld("bankaiTerminal", terminalApi);
