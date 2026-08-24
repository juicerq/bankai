import { homedir } from "node:os";
import { join } from "node:path";

function opencodeDataDir(): string {
	const xdg = process.env.XDG_DATA_HOME;
	return join(xdg ?? join(homedir(), ".local", "share"), "opencode");
}

function opencodeDbPath(): string {
	return join(opencodeDataDir(), "opencode.db");
}

export const OpencodeConfig = {
	dir: opencodeDataDir,
	dbPath: opencodeDbPath,
};
