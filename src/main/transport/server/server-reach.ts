import { LiveConnections } from "@main/transport/server/live-connections";
import { Settings } from "@main/store/settings";
import type { ServerReach } from "@shared/server";

let current: ServerReach | undefined;

async function openServerReach(): Promise<ServerReach> {
	current = await Settings.ensureServer();

	return current;
}

async function regenerateServerToken(): Promise<ServerReach> {
	current = await Settings.regenerateServerToken();
	LiveConnections.closeAll();

	return current;
}

function serverReach(): ServerReach {
	if (!current) {
		throw new Error("The Bankai server is not running");
	}

	return current;
}

export const Reach = {
	open: openServerReach,
	regenerateToken: regenerateServerToken,
	current: serverReach,
};
