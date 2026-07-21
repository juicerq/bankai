import { createRequire } from "node:module";
import { join } from "node:path";
import type * as ElectronModule from "electron";

const require = createRequire(import.meta.url);

export function resolveDataDir(): string {
	const fromEnv = process.env.DATA_DIR;
	if (fromEnv) {
		return fromEnv;
	}

	const { app } = require("electron") as typeof ElectronModule;
	return join(app.getPath("userData"), "store");
}
