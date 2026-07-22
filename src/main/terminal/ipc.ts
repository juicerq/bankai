import { type } from "arktype";
import { ipcMain, type WebContents } from "electron";
import { Logger } from "@main/logger";
import { terminalColumnsSchema, terminalRowsSchema } from "@main/terminal/dimensions";
import { TerminalSessions } from "@main/terminal/TerminalSessions";
import type { TerminalCommandErrorEvent } from "@shared/terminal";

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
	ipcMain.on("terminal:write", (event, raw: unknown) => {
		const input = readTerminalCommand(event.sender, "write", raw, (value) => {
			const parsed = TerminalSchemas.write.assert(value);
			if (parsed.data.length > 65_536) {
				throw new Error("Terminal input exceeds 64 KiB");
			}
			return parsed;
		});
		if (!input) {
			return;
		}
		runTerminalCommand(event.sender, "write", input.sessionId, () => {
			TerminalSessions.write(event.sender.id, input.sessionId, input.data);
		});
	});
	ipcMain.on("terminal:resize", (event, raw: unknown) => {
		const input = readTerminalCommand(
			event.sender,
			"resize",
			raw,
			(value) => TerminalSchemas.resize.assert(value),
		);
		if (!input) {
			return;
		}
		runTerminalCommand(event.sender, "resize", input.sessionId, () => {
			TerminalSessions.resize(event.sender.id, input.sessionId, input.cols, input.rows);
		});
	});
	ipcMain.on("terminal:close", (event, raw: unknown) => {
		const input = readTerminalCommand(
			event.sender,
			"close",
			raw,
			(value) => TerminalSchemas.close.assert(value),
		);
		if (!input) {
			return;
		}
		runTerminalCommand(event.sender, "close", input.sessionId, () => {
			TerminalSessions.close(event.sender.id, input.sessionId);
		});
	});
}

function readTerminalCommand<Input>(
	owner: WebContents,
	command: TerminalCommandErrorEvent["command"],
	raw: unknown,
	parse: (value: unknown) => Input,
): Input | undefined {
	try {
		return parse(raw);
	} catch (err) {
		Logger.warn(`terminal:${command}-invalid`, {
			ownerId: owner.id,
			err: String(err),
		});
		return undefined;
	}
}

function runTerminalCommand(
	owner: WebContents,
	command: TerminalCommandErrorEvent["command"],
	sessionId: string,
	run: () => void,
): void {
	try {
		run();
	} catch (err) {
		const error = String(err);
		Logger.error(`terminal:${command}-failed`, { ownerId: owner.id, sessionId, err: error });
		if (owner.isDestroyed()) {
			return;
		}
		try {
			owner.send("terminal:command-error", {
				sessionId,
				command,
				error,
			} satisfies TerminalCommandErrorEvent);
		} catch (sendErr) {
			Logger.error("terminal:command-error-send-failed", {
				ownerId: owner.id,
				sessionId,
				err: String(sendErr),
			});
		}
	}
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
