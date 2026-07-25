import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import type * as ElectronModule from "electron";

const require = createRequire(import.meta.url);

export const DEV_DESKTOP_NAME = "bankai-dev.desktop";

export interface InstanceIdentity {
	userDataDir: string;
	singleInstanceLock: boolean;
	desktopName?: string;
}

export function resolveInstanceIdentity(input: {
	packaged: boolean;
	prodUserDataDir: string;
}): InstanceIdentity {
	if (input.packaged) {
		return { userDataDir: input.prodUserDataDir, singleInstanceLock: true };
	}

	const devDir = join(
		dirname(input.prodUserDataDir),
		`${basename(input.prodUserDataDir)}-dev`,
	);

	return { userDataDir: devDir, singleInstanceLock: false, desktopName: DEV_DESKTOP_NAME };
}

export function resolveDataDir(): string {
	const fromEnv = process.env.DATA_DIR;
	if (fromEnv) {
		return fromEnv;
	}

	const { app }: typeof ElectronModule = require("electron");
	return join(app.getPath("userData"), "store");
}
