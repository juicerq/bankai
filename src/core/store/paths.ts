import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDataDir(): string {
	const fromEnv = process.env.DATA_DIR;
	if (fromEnv) {
		return fromEnv;
	}

	const xdg = process.env.XDG_DATA_HOME;
	const base = xdg ?? join(homedir(), ".local", "share");
	return join(base, "project-j", "store");
}
