import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { Router } from "@main/transport/rpc/router";
import { isBrowserClient } from "@renderer/lib/platform";
import { reach } from "@renderer/lib/reach";
import { streamSocket } from "@renderer/lib/stream/socket";
import { SERVER_RPC_PREFIX } from "@shared/server";

const link = new RPCLink({
	url: async () => `${(await reach()).origin}${SERVER_RPC_PREFIX}`,
	headers: async () => {
		const { token } = await reach();

		if (!token) {
			return {};
		}

		return { authorization: `Bearer ${token}` };
	},
	fetch: async (request, init) => {
		const response = await globalThis.fetch(request, init);

		if (response.status === 401 && isBrowserClient()) {
			streamSocket.unpair();
		}

		return response;
	},
});

export const client: RouterClient<Router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
