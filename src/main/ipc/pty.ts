import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import type { SessionSupervisor } from "@main/sessions/SessionSupervisor";
import {
	PTY_DATA,
	PTY_EXIT,
	PTY_INPUT,
	PTY_RESIZE,
	type PtyInput,
	type PtyResize,
} from "@shared/pty";

export function registerPtyStream(
	win: BrowserWindow,
	supervisor: SessionSupervisor,
) {
	supervisor.onData((e) => win.webContents.send(PTY_DATA, e));
	supervisor.onExit((e) => win.webContents.send(PTY_EXIT, e));

	ipcMain.on(PTY_INPUT, (_e, msg: PtyInput) =>
		supervisor.write(msg.sessionId, msg.data),
	);
	ipcMain.on(PTY_RESIZE, (_e, msg: PtyResize) =>
		supervisor.resize(msg.sessionId, msg.cols, msg.rows),
	);
}
