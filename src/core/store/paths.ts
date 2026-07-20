import { homedir } from "node:os";
import { join } from "node:path";

export function resolveDataDir(): string {
	const fromEnv = process.env.DATA_DIR;
	if (fromEnv) {
		return fromEnv;
	}

	if (process.env.NODE_ENV === "test") {
		throw new Error(
			"DATA_DIR is not set under NODE_ENV=test; refusing to touch the real store. Run tests via 'bun run test' (vitest), which isolates DATA_DIR.",
		);
	}

	const xdg = process.env.XDG_DATA_HOME;
	const base = xdg ?? join(homedir(), ".local", "share");
	return join(base, "bankai", "store");
}
