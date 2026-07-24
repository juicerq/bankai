import { contextBridge, ipcRenderer } from "electron";
import type {
	BankaiTerminalApi,
	TerminalCommandErrorEvent,
	TerminalEvent,
	TerminalExitEvent,
} from "@shared/terminal";
import { ACTIVITY_IPC, type ActivityChangedEvent, type BankaiActivityApi } from "@shared/activity";
import { REVIEW_IPC, type BankaiReviewApi, type ReviewChangedEvent } from "@shared/review";
import { UPDATE_IPC, type BankaiUpdateApi, type UpdateDownloadedEvent } from "@shared/update";
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
	open: (projectId, shellId, cols, rows) =>
		ipcRenderer.invoke("terminal:open", { projectId, shellId, cols, rows }),
	resume: (projectId, shellId, cols, rows) =>
		ipcRenderer.invoke("terminal:resume", { projectId, shellId, cols, rows }),
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

const reviewApi: BankaiReviewApi = {
	watch: async (projectId) => {
		await ipcRenderer.invoke(REVIEW_IPC.watch, { projectId });
	},
	unwatch: (projectId) => ipcRenderer.send(REVIEW_IPC.unwatch, { projectId }),
	onChanged: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: ReviewChangedEvent) => {
			listener(payload);
		};
		ipcRenderer.on(REVIEW_IPC.changed, handler);
		return () => ipcRenderer.removeListener(REVIEW_IPC.changed, handler);
	},
};

contextBridge.exposeInMainWorld("bankaiReview", reviewApi);

const activityApi: BankaiActivityApi = {
	watch: (projectId) => ipcRenderer.invoke(ACTIVITY_IPC.watch, { projectId }),
	unwatch: (projectId) => ipcRenderer.send(ACTIVITY_IPC.unwatch, { projectId }),
	markViewed: (sessionId) => ipcRenderer.send(ACTIVITY_IPC.viewed, { sessionId }),
	onChanged: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: ActivityChangedEvent) => {
			listener(payload);
		};
		ipcRenderer.on(ACTIVITY_IPC.changed, handler);
		return () => ipcRenderer.removeListener(ACTIVITY_IPC.changed, handler);
	},
};

contextBridge.exposeInMainWorld("bankaiActivity", activityApi);

const updateApi: BankaiUpdateApi = {
	getPending: () => ipcRenderer.invoke(UPDATE_IPC.getPending),
	install: () => ipcRenderer.send(UPDATE_IPC.install),
	onDownloaded: (listener) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: UpdateDownloadedEvent) => {
			listener(payload);
		};
		ipcRenderer.on(UPDATE_IPC.downloaded, handler);
		return () => ipcRenderer.removeListener(UPDATE_IPC.downloaded, handler);
	},
};

contextBridge.exposeInMainWorld("bankaiUpdate", updateApi);

const windowApi: BankaiWindowApi = {
	minimize: () => ipcRenderer.send("window:minimize"),
	toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
	close: () => ipcRenderer.send("window:close"),
};

contextBridge.exposeInMainWorld("bankaiWindow", windowApi);
