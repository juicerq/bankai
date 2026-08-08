import { randomBytes } from "node:crypto";
import { SettingsStore } from "@main/store/settings-store";
import { SERVER_DEFAULT_PORT, SERVER_TOKEN_BYTES, type ServerReach } from "@shared/server";

function serverPort(stored: number | undefined): number {
	const fromEnv = process.env.SERVER_PORT;
	if (!fromEnv) {
		return stored ?? SERVER_DEFAULT_PORT;
	}

	const port = Number(fromEnv);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`SERVER_PORT must be a port number between 1 and 65535, got "${fromEnv}"`);
	}

	return port;
}

function mintServerToken(): string {
	return randomBytes(SERVER_TOKEN_BYTES).toString("hex");
}

export const ServerSettings = {
	port: serverPort,

	ensure: async (): Promise<ServerReach> => {
		const current = await SettingsStore.read();
		const server = current.server ?? { token: mintServerToken() };

		if (!current.server) {
			await SettingsStore.mutate((value) => ({ ...value, server }));
		}

		return { port: serverPort(server.port), token: server.token };
	},

	regenerateToken: async (): Promise<ServerReach> => {
		const next = await SettingsStore.mutate((current) => ({
			...current,
			server: { ...current.server, token: mintServerToken() },
		}));

		if (!next.server) {
			throw new Error("The regenerated server token was not stored");
		}

		return { port: serverPort(next.server.port), token: next.server.token };
	},

	tailnetAccess: async (): Promise<boolean> => !!(await SettingsStore.read()).server?.tailnet,

	setTailnetAccess: async (tailnet: boolean): Promise<void> => {
		await SettingsStore.mutate((current) => {
			if (!current.server) {
				throw new Error("The server has no stored token to attach tailnet access to");
			}

			return { ...current, server: { ...current.server, tailnet } };
		});
	},
};
