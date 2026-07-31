import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type * as ElectronModule from "electron";

const require = createRequire(import.meta.url);
export const LOGGER_MAX_SIZE_BYTES = 10 * 1024 * 1024;

type Severity = "info" | "warn" | "error";
interface LogEvent { ts: number; severity: Severity; message: string; data?: unknown }

function resolveLogPath(): string {
	const fromEnv = process.env.DATA_DIR;
	if (fromEnv) {
		return join(fromEnv, "log.ndjson");
	}
	const { app }: typeof ElectronModule = require("electron");
	return join(app.getPath("userData"), "log.ndjson");
}

function rotateBeforeAppend(path: string, incomingBytes: number): void {
	let currentBytes = 0;
	try {
		currentBytes = statSync(path).size;
	} catch {}
	if (currentBytes + incomingBytes <= LOGGER_MAX_SIZE_BYTES) {
		return;
	}
	rmSync(`${path}.old`, { force: true });
	try {
		renameSync(path, `${path}.old`);
	} catch {}
}

function write(severity: Severity, message: string, data?: unknown): void {
	const event: LogEvent = { ts: Date.now(), severity, message };
	if (data !== undefined) {
		event.data = data;
	}
	const line = `${JSON.stringify(event)}\n`;
	const lineBytes = Buffer.byteLength(line);
	if (lineBytes <= LOGGER_MAX_SIZE_BYTES) {
		try {
			const path = resolveLogPath();
			mkdirSync(dirname(path), { recursive: true });
			rotateBeforeAppend(path, lineBytes);
			appendFileSync(path, line);
		} catch {}
	}
	if (severity !== "info") {
		console[severity](message, data || "");
	}
}

export const Logger = {
	info: (message: string, data?: unknown) => write("info", message, data),
	warn: (message: string, data?: unknown) => write("warn", message, data),
	error: (message: string, data?: unknown) => write("error", message, data),
};
