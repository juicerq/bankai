import type { AppUpdater } from "electron-updater";
import { app, BrowserWindow, ipcMain } from "electron";
import { Logger } from "@main/infra/logger";
import { SelfUpdate } from "@main/desktop/self-update";
import { AgentActivity } from "@main/agents/agent-activity";
import { shellProcesses } from "@main/terminal/shell-processes";
import { UPDATE_IPC, type UpdateDownloadedEvent, type UpdateWorkload } from "@shared/update";

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_CHECK_TTL_MS = 5 * 60 * 1000;

let pending: UpdateDownloadedEvent | undefined;
let checkedAt = 0;

async function loadAutoUpdater(): Promise<AppUpdater> {
	const updater = await import("electron-updater");

	return (updater.default ?? updater).autoUpdater;
}

async function setupUpdateIpc(): Promise<void> {
	ipcMain.handle(UPDATE_IPC.getPending, () => pending ?? null);

	ipcMain.handle(UPDATE_IPC.activeWork, () => countActiveWork());

	ipcMain.on(UPDATE_IPC.install, () => {
		void install();
	});

	if (!app.isPackaged) {
		return;
	}

	if (
		!SelfUpdate.allowed({
			platform: process.platform,
			execPath: process.execPath,
			appImage: process.env.APPIMAGE,
			appDir: process.env.APPDIR,
		})
	) {
		Logger.info("update:managed-externally", { execPath: process.execPath });
		return;
	}

	const autoUpdater = await loadAutoUpdater();

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
	app.on("browser-window-focus", () => checkForUpdates(autoUpdater));
}

async function install(): Promise<void> {
	if (!pending) {
		return;
	}

	try {
		const autoUpdater = await loadAutoUpdater();

		autoUpdater.quitAndInstall();
	} catch (err) {
		Logger.error("update:install-failed", { err: String(err) });
	}
}

function countActiveWork(): UpdateWorkload {
	const shells = shellProcesses.list();

	if (process.platform !== "linux") {
		return { kind: "shells", count: shells.length };
	}

	const projectIds = new Set(shells.map((shell) => shell.projectId));
	let count = 0;

	for (const projectId of projectIds) {
		for (const state of Object.values(AgentActivity.getProjectSnapshot(projectId).shells)) {
			if (state === "working" || state === "needs-attention") {
				count += 1;
			}
		}
	}

	return { kind: "agents", count };
}

function checkForUpdates(autoUpdater: AppUpdater): void {
	const now = Date.now();
	if (now - checkedAt < UPDATE_CHECK_TTL_MS) {
		return;
	}

	checkedAt = now;
	autoUpdater.checkForUpdates().catch((err) => Logger.error("update:check-failed", { err: String(err) }));
}

export const UpdateIpc = {
	setup: setupUpdateIpc,
};
