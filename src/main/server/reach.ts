import { Settings } from "@main/store/settings";
import type { ServerReach } from "@shared/server";

let current: ServerReach | undefined;

export async function openServerReach(): Promise<ServerReach> {
	current = await Settings.ensureServer();

	return current;
}

export async function regenerateServerToken(): Promise<ServerReach> {
	current = await Settings.regenerateServerToken();

	return current;
}

export function serverReach(): ServerReach {
	if (!current) {
		throw new Error("The Bankai server is not running");
	}

	return current;
}
