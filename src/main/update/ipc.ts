import electronUpdater from "electron-updater";
import { app, BrowserWindow, ipcMain } from "electron";
import { Logger } from "@main/logger";
import { UPDATE_IPC, type UpdateDownloadedEvent } from "@shared/update";

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let pending: UpdateDownloadedEvent | undefined;

export function setupUpdateIpc(): void {
	const { autoUpdater } = electronUpdater;

	ipcMain.handle(UPDATE_IPC.getPending, () => pending ?? null);

	ipcMain.on(UPDATE_IPC.install, () => {
		if (!pending) {
			return;
		}
		try {
			autoUpdater.quitAndInstall();
		} catch (err) {
			Logger.error("update:install-failed", { err: String(err) });
		}
	});

	if (!app.isPackaged) {
		return;
	}

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.logger = {
		info: (message) => Logger.info("update", { message: String(message) }),
		warn: (message) => Logger.warn("update", { message: String(message) }),
		error: (message) => Logger.error("update", { message: String(message) }),
		debug: () => {},
	};

	autoUpdater.on("update-downloaded", (info) => {
		pending = { version: info.version };
		for (const win of BrowserWindow.getAllWindows()) {
			if (!win.webContents.isDestroyed()) {
				win.webContents.send(UPDATE_IPC.downloaded, pending);
			}
		}
	});

	autoUpdater.on("error", (err) => {
		Logger.error("update:error", { err: String(err) });
	});

	checkForUpdates(autoUpdater);
	setInterval(() => checkForUpdates(autoUpdater), UPDATE_CHECK_INTERVAL_MS);
}

function checkForUpdates(autoUpdater: electronUpdater.AppUpdater): void {
	autoUpdater.checkForUpdates().catch((err) => Logger.error("update:check-failed", { err: String(err) }));
}
