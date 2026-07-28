import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import { CORSPlugin } from "@orpc/server/plugins";
import { Logger } from "@main/logger";
import { router } from "@main/router";
import { authorizeRequest } from "@main/server/auth";
import { listenLoopback } from "@main/server/listen";
import { Settings } from "@main/store/settings";
import { SERVER_RPC_PREFIX, type ServerReach } from "@shared/server";

const CORS_HEADERS = { "access-control-allow-origin": "*" };

const rpc = new RPCHandler(router, {
	plugins: [new CORSPlugin({ origin: "*" })],
	interceptors: [
		onError((err) => {
			Logger.error("server:orpc", { err: String(err) });
		}),
	],
});

export async function startLoopbackServer(): Promise<ServerReach> {
	const reach = await Settings.ensureServer();

	const server = createServer((req, res) => {
		route(req, res, reach.token).catch((err) => {
			Logger.error("server:request-failed", { err: String(err), url: req.url });

			if (!res.headersSent) {
				res.writeHead(500, CORS_HEADERS);
			}

			res.end();
		});
	});

	await listenLoopback(server, reach.port);

	server.on("error", (err) => Logger.error("server:error", { err: String(err) }));

	return reach;
}

async function route(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
	if (!req.url?.startsWith(SERVER_RPC_PREFIX)) {
		res.writeHead(404, CORS_HEADERS).end();
		return;
	}

	if (req.method !== "OPTIONS" && !authorizeRequest(req.headers.authorization, token)) {
		res.writeHead(401, CORS_HEADERS).end();
		return;
	}

	const { matched } = await rpc.handle(req, res, { prefix: SERVER_RPC_PREFIX });

	if (!matched) {
		res.writeHead(404, CORS_HEADERS).end();
	}
}
