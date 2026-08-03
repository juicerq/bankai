import { homedir } from "node:os";
import { join } from "node:path";

function codexConfigDir(): string {
	return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

function codexSessionsDir(): string {
	return join(codexConfigDir(), "sessions");
}

export const CodexConfig = {
	dir: codexConfigDir,
	sessionsDir: codexSessionsDir,
};
