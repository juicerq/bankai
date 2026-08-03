import type { BrowserWindow } from "electron";

type AttentionWindow = Pick<BrowserWindow, "flashFrame" | "isDestroyed" | "isFocused"> & {
	on: (event: "focus", listener: () => void) => unknown;
};

let mainWindow: AttentionWindow | undefined;

function setupDesktopAttention(win: AttentionWindow): void {
	mainWindow = win;
	win.on("focus", () => win.flashFrame(false));
}

function requestDesktopAttention(): void {
	if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) {
		return;
	}

	mainWindow.flashFrame(true);
}

export const DesktopAttention = {
	setup: setupDesktopAttention,
	request: requestDesktopAttention,
};
