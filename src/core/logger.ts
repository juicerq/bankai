import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type Severity = "info" | "warn" | "error";

type LogEvent = {
	ts: number;
	severity: Severity;
	message: string;
	data?: unknown;
};

let initializedPath: string | null = null;

function resolveLogPath(): string {
	const fromEnv = process.env.DATA_DIR;
	if (fromEnv) {
		return join(fromEnv, "log.ndjson");
	}

	const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
	return join(base, "bankai", "log.ndjson");
}

function rotateIfNeeded(path: string): void {
	try {
		const size = statSync(path).size;
		if (size > MAX_SIZE_BYTES) {
			renameSync(path, `${path}.old`);
		}
	} catch (error) {
		if (
			typeof error === "object"
			&& error !== null
			&& "code" in error
			&& error.code === "ENOENT"
		) {
			return;
		}

		throw error;
	}
}

function ensureInit(path: string): void {
	if (initializedPath === path) {
		return;
	}

	mkdirSync(dirname(path), { recursive: true });
	rotateIfNeeded(path);
	initializedPath = path;
}

function persist(path: string, event: LogEvent): boolean {
	try {
		ensureInit(path);
		appendFileSync(path, `${JSON.stringify(event)}\n`);
		return true;
	} catch {
		return false;
	}
}

function write(severity: Severity, message: string, data?: unknown): void {
	const event: LogEvent = { ts: Date.now(), severity, message };
	if (data !== undefined) {
		event.data = data;
	}

	const path = resolveLogPath();
	persist(path, event);

	if (severity !== "info") {
		if (data === undefined) {
			console[severity](message);
		} else {
			console[severity](message, data);
		}
	}
}

export const Logger = {
	info: (message: string, data?: unknown) => write("info", message, data),
	warn: (message: string, data?: unknown) => write("warn", message, data),
	error: (message: string, data?: unknown) => write("error", message, data),
};
