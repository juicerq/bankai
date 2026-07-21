import { BrowserWindow, ipcMain } from "electron";

export function setupWindowIpc() {
	ipcMain.on("window:minimize", (event) => {
		BrowserWindow.fromWebContents(event.sender)?.minimize();
	});

	ipcMain.on("window:toggle-maximize", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win) {
			return;
		}
		if (win.isMaximized()) {
			win.unmaximize();
		} else {
			win.maximize();
		}
	});

	ipcMain.on("window:close", (event) => {
		BrowserWindow.fromWebContents(event.sender)?.close();
	});
}
