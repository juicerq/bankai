import { app } from "electron";
import electronUpdater from "electron-updater";
import { Logger } from "@main/logger";

const updater = electronUpdater.autoUpdater;

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function setupAutoUpdate(): void {
	if (!app.isPackaged) {
		return;
	}

	updater.autoDownload = true;
	updater.autoInstallOnAppQuit = true;

	updater.on("error", (err) => {
		Logger.error("auto-update:error", { err: String(err) });
	});

	updater.on("update-downloaded", (info) => {
		Logger.info("auto-update:downloaded", { version: info.version });
	});

	updater.checkForUpdates().catch((err: unknown) => {
		Logger.error("auto-update:initial-check-failed", { err: String(err) });
	});

	setInterval(() => {
		updater.checkForUpdates().catch((err: unknown) => {
			Logger.error("auto-update:periodic-check-failed", { err: String(err) });
		});
	}, SIX_HOURS_MS);
}
