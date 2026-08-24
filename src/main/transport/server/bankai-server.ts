import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import { CORSPlugin } from "@orpc/server/plugins";
import { APP_VERSION } from "@main/infra/app-version";
import { Logger } from "@main/infra/logger";
import { router } from "@main/transport/rpc/router";
import { ServerAuth } from "@main/transport/server/server-auth";
import { type BundleAssets } from "@main/transport/server/renderer-bundle";
import { RendererBundle } from "@main/transport/server/renderer-bundle";
import { ServerListen } from "@main/transport/server/server-listen";
import { Reach } from "@main/transport/server/server-reach";
import { StreamServer } from "@main/transport/stream/stream-server";
import {
	DAEMON_HELLO_PATH,
	DAEMON_PROTOCOL_VERSION,
	type DaemonHello,
} from "@shared/daemon";
import { SERVER_HOST, SERVER_RPC_PREFIX, type ServerReach } from "@shared/server";

const CORS_HEADERS = { "access-control-allow-origin": "*" };

const DEV_BUNDLE_NOTICE =
	"Bankai serves the renderer bundle only when packaged. In development, open the Vite dev server instead.";

const rpc = new RPCHandler(router, {
	plugins: [new CORSPlugin({ origin: "*" })],
	interceptors: [
		onError((err) => {
			Logger.error("server:orpc", { err: String(err) });
		}),
	],
});

let bundle: BundleAssets | undefined;

function createBankaiServer(): Server {
	const server = createServer((req, res) => {
		route(req, res, bundle).catch((err) => {
			Logger.error("server:request-failed", { err: String(err), url: req.url });

			if (!res.headersSent) {
				res.writeHead(500, CORS_HEADERS);
			}

			res.end();
		});
	});

	StreamServer.attach(server);

	server.on("error", (err) => Logger.error("server:error", { err: String(err) }));

	return server;
}

async function startLoopbackServer(): Promise<ServerReach> {
	const reach = await Reach.open();

	if (!process.env.ELECTRON_RENDERER_URL) {
		bundle = await RendererBundle.read(join(import.meta.dirname, "../renderer"));
	}

	await ServerListen.on(createBankaiServer(), { port: reach.port, host: SERVER_HOST });

	return reach;
}

function fromLoopback(req: IncomingMessage): boolean {
	return req.socket.localAddress === SERVER_HOST;
}

async function route(
	req: IncomingMessage,
	res: ServerResponse,
	bundle: BundleAssets | undefined,
): Promise<void> {
	if (req.url === DAEMON_HELLO_PATH && fromLoopback(req)) {
		res
			.writeHead(200, { "content-type": "application/json" })
			.end(
				JSON.stringify({
					protocolVersion: DAEMON_PROTOCOL_VERSION,
					appVersion: APP_VERSION,
					pid: process.pid,
				} satisfies DaemonHello),
			);
		return;
	}

	if (!req.url?.startsWith(SERVER_RPC_PREFIX)) {
		await serveRenderer(req.url ?? "/", res, bundle);
		return;
	}

	if (req.method !== "OPTIONS" && !ServerAuth.request(req.headers.authorization, Reach.current().token)) {
		res.writeHead(401, CORS_HEADERS).end();
		return;
	}

	const { matched } = await rpc.handle(req, res, {
		prefix: SERVER_RPC_PREFIX,
		context: { loopback: fromLoopback(req) },
	});

	if (!matched) {
		res.writeHead(404, CORS_HEADERS).end();
	}
}

async function serveRenderer(
	url: string,
	res: ServerResponse,
	bundle: BundleAssets | undefined,
): Promise<void> {
	if (!bundle) {
		await serveDevRenderer(url, res);
		return;
	}

	const asset = RendererBundle.resolveAsset(bundle, url);

	if (!asset) {
		res.writeHead(404, CORS_HEADERS).end();
		return;
	}

	res
		.writeHead(200, {
			...CORS_HEADERS,
			"content-type": asset.contentType,
			"content-length": asset.body.byteLength,
			"cache-control": asset.cacheControl,
		})
		.end(asset.body);
}

async function serveDevRenderer(url: string, res: ServerResponse): Promise<void> {
	const renderer = process.env.ELECTRON_RENDERER_URL;

	if (!renderer) {
		res
			.writeHead(503, { ...CORS_HEADERS, "content-type": "text/plain; charset=utf-8" })
			.end(DEV_BUNDLE_NOTICE);
		return;
	}

	const upstream = await fetch(new URL(url, renderer));
	const body = Buffer.from(await upstream.arrayBuffer());

	res
		.writeHead(upstream.status, {
			...CORS_HEADERS,
			"content-type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
			"content-length": body.byteLength,
		})
		.end(body);
}

export const BankaiServer = {
	create: createBankaiServer,
	startLoopback: startLoopbackServer,
};
