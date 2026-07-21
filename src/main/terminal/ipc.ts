import { type } from "arktype";
import { ipcMain, type WebContents } from "electron";
import { terminalColumnsSchema, terminalRowsSchema } from "@main/terminal/dimensions";
import { TerminalSessions } from "@main/terminal/TerminalSessions";

const TerminalSchemas = {
	open: type({ projectId: "string", cols: terminalColumnsSchema, rows: terminalRowsSchema }),
	write: type({ sessionId: "string", data: "string" }),
	resize: type({ sessionId: "string", cols: terminalColumnsSchema, rows: terminalRowsSchema }),
	close: type({ sessionId: "string" }),
};

const owners = new Set<number>();

export function setupTerminalIpc() {
	ipcMain.handle("terminal:open", async (event, raw: unknown) => {
		const input = TerminalSchemas.open.assert(raw);
		registerOwner(event.sender);
		return await TerminalSessions.open(event.sender, input.projectId, input.cols, input.rows);
	});
	ipcMain.handle("terminal:write", (event, raw: unknown) => {
		const input = TerminalSchemas.write.assert(raw);
		if (input.data.length > 65_536) {
			throw new Error("Terminal input exceeds 64 KiB");
		}
		TerminalSessions.write(event.sender.id, input.sessionId, input.data);
	});
	ipcMain.handle("terminal:resize", (event, raw: unknown) => {
		const input = TerminalSchemas.resize.assert(raw);
		TerminalSessions.resize(event.sender.id, input.sessionId, input.cols, input.rows);
	});
	ipcMain.handle("terminal:close", (event, raw: unknown) => {
		const input = TerminalSchemas.close.assert(raw);
		TerminalSessions.close(event.sender.id, input.sessionId);
	});
}

function registerOwner(owner: WebContents) {
	if (owners.has(owner.id)) {
		return;
	}
	owners.add(owner.id);
	owner.on("did-start-navigation", (_event, _url, _isInPlace, isMainFrame) => {
		if (isMainFrame) {
			TerminalSessions.closeOwner(owner.id);
		}
	});
	owner.on("render-process-gone", () => TerminalSessions.closeOwner(owner.id));
	owner.once("destroyed", () => {
		owners.delete(owner.id);
		TerminalSessions.closeOwner(owner.id);
	});
}
