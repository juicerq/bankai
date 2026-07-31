import type { BrowserWindow } from "electron";

type AttentionWindow = Pick<BrowserWindow, "flashFrame" | "isDestroyed" | "isFocused"> & {
	on: (event: "focus", listener: () => void) => unknown;
};

let mainWindow: AttentionWindow | undefined;

export function setupDesktopAttention(win: AttentionWindow): void {
	mainWindow = win;
	win.on("focus", () => win.flashFrame(false));
}

export function requestDesktopAttention(): void {
	if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) {
		return;
	}

	mainWindow.flashFrame(true);
}
