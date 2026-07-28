import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "@main/router";
import { SERVER_HOST, SERVER_RPC_PREFIX, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

async function resolveReach(): Promise<{ origin: string; token: string | undefined }> {
	const bridge = window.bankaiAuth;

	if (!bridge) {
		return {
			origin: window.location.origin,
			token: localStorage.getItem(SERVER_TOKEN_STORAGE_KEY) ?? undefined,
		};
	}

	const { port, token } = await bridge.getToken();

	return { origin: `http://${SERVER_HOST}:${port}`, token };
}

const reach = resolveReach();

const link = new RPCLink({
	url: async () => `${(await reach).origin}${SERVER_RPC_PREFIX}`,
	headers: async () => {
		const { token } = await reach;

		if (!token) {
			return {};
		}

		return { authorization: `Bearer ${token}` };
	},
});

export const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
