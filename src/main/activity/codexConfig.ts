import { homedir } from "node:os";
import { join } from "node:path";

export function codexConfigDir(): string {
	return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

export function codexSessionsDir(): string {
	return join(codexConfigDir(), "sessions");
}
