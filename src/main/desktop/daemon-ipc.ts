import { dialog, ipcMain } from "electron";
import { DaemonClient } from "@main/desktop/daemon-client";
import { Logger } from "@main/infra/logger";
import { DAEMON_IPC } from "@shared/daemon-ipc";

async function restartDaemon(): Promise<void> {
	try {
		await DaemonClient.restart();
	} catch (err) {
		Logger.error("daemon:restart-failed", { err: String(err) });

		await DaemonClient.ensure().catch((recovery: unknown) => {
			Logger.error("daemon:restart-recovery-failed", { err: String(recovery) });
			dialog.showErrorBox("Bankai's core did not restart", String(err));

			throw err;
		});
	}
}

function setupDaemonIpc(): void {
	ipcMain.handle(DAEMON_IPC.getSkew, () => DaemonClient.skew());
	ipcMain.handle(DAEMON_IPC.activeWork, () => DaemonClient.workload());
	ipcMain.handle(DAEMON_IPC.restart, () => restartDaemon());
}

export const DaemonIpc = {
	setup: setupDaemonIpc,
};
