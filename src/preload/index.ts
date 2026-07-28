import { contextBridge, ipcRenderer } from "electron";
import { AUTH_IPC, type BankaiAuthApi } from "@shared/server";
import { UPDATE_IPC, type BankaiUpdateApi, type UpdateDownloadedEvent } from "@shared/update";
import type { BankaiWindowApi } from "@shared/window";

const authApi: BankaiAuthApi = {
	getToken: () => ipcRenderer.invoke(AUTH_IPC.getToken),
};

contextBridge.exposeInMainWorld("bankaiAuth", authApi);

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

let maximized = false;
const maximizedListeners = new Set<() => void>();

ipcRenderer.on("window:maximized", (_event, value: boolean) => {
	maximized = value;
	for (const listener of maximizedListeners) {
		listener();
	}
});

const windowApi: BankaiWindowApi = {
	minimize: () => ipcRenderer.send("window:minimize"),
	toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
	close: () => ipcRenderer.send("window:close"),
	isMaximized: () => maximized,
	onMaximizedChange: (listener) => {
		maximizedListeners.add(listener);

		return () => {
			maximizedListeners.delete(listener);
		};
	},
};

contextBridge.exposeInMainWorld("bankaiWindow", windowApi);
