import { describe, expect, it } from "bun:test";
import { APP_VERSION } from "@main/infra/app-version";
import { BankaiServer } from "@main/transport/server/bankai-server";
import { Reach } from "@main/transport/server/server-reach";
import { ServerListen } from "@main/transport/server/server-listen";
import { DAEMON_HELLO_PATH, DAEMON_PROTOCOL_VERSION, daemonHelloSchema } from "@shared/daemon";
import { SERVER_HOST } from "@shared/server";

async function loopbackServer() {
	await Reach.open();

	const server = BankaiServer.create();
	await ServerListen.on(server, { port: 0, host: SERVER_HOST });

	const address = server.address();

	if (typeof address !== "object" || address === null) {
		throw new Error("expected a bound TCP address");
	}

	return { origin: `http://${SERVER_HOST}:${address.port}`, close: () => server.close() };
}

describe("daemon hello", () => {
	it("answers the loopback probe with no token at all", async () => {
		const server = await loopbackServer();

		const response = await fetch(`${server.origin}${DAEMON_HELLO_PATH}`);
		const hello = daemonHelloSchema.assert(await response.json());

		expect(response.status).toBe(200);
		expect(hello).toEqual({
			protocolVersion: DAEMON_PROTOCOL_VERSION,
			appVersion: APP_VERSION,
			pid: process.pid,
		});

		server.close();
	});

	it("keeps the answer away from web pages, so no site reads the pid", async () => {
		const server = await loopbackServer();

		const response = await fetch(`${server.origin}${DAEMON_HELLO_PATH}`);
		await response.body?.cancel();

		expect(response.headers.get("access-control-allow-origin")).toBeNull();

		server.close();
	});
});
