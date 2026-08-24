import { dialog, ipcMain, shell } from "electron";
import { ClipboardImage } from "@main/desktop/clipboard-image";
import { DesktopAttention } from "@main/desktop/desktop-attention";
import type { AttentionReason } from "@shared/activity";
import { DESKTOP_IPC } from "@shared/desktop";

function setupDesktopIpc(): void {
	ipcMain.on(DESKTOP_IPC.attention, (_event, reason: AttentionReason, count: number) => {
		DesktopAttention.request(reason, count);
	});

	ipcMain.handle(DESKTOP_IPC.pickDirectory, async () => {
		const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Add project" });

		if (result.canceled) {
			return null;
		}

		return result.filePaths[0] ?? null;
	});

	ipcMain.handle(DESKTOP_IPC.openPath, async (_event, path: string) => {
		const error = await shell.openPath(path);

		if (error) {
			throw new Error(error);
		}
	});

	ipcMain.handle(DESKTOP_IPC.clipboardImage, () => ClipboardImage.save());
}

export const DesktopIpc = {
	setup: setupDesktopIpc,
};
