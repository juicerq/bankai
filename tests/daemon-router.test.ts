import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { describe, expect, it } from "bun:test";
import type { Router } from "@main/transport/rpc/router";
import { BankaiServer } from "@main/transport/server/bankai-server";
import { Reach } from "@main/transport/server/server-reach";
import { ServerListen } from "@main/transport/server/server-listen";
import { shellProcesses } from "@main/terminal/shell-processes";
import { SERVER_HOST, SERVER_RPC_PREFIX } from "@shared/server";

const OFF_LOOPBACK_HOST = "127.0.0.2";

async function daemonClient(host: string = SERVER_HOST) {
	const reach = await Reach.open();
	const server = BankaiServer.create();
	await ServerListen.on(server, { port: 0, host });

	const address = server.address();

	if (typeof address !== "object" || address === null) {
		throw new Error("expected a bound TCP address");
	}

	const link = new RPCLink({
		url: `http://${host}:${address.port}${SERVER_RPC_PREFIX}`,
		headers: { authorization: `Bearer ${reach.token}` },
	});

	const client: RouterClient<Router> = createORPCClient(link);

	return { client, port: address.port, close: () => server.close() };
}

function openShell(shellId: string): string {
	const sessionId = `session-${shellId}`;

	shellProcesses.register({
		projectId: "daemon-router",
		shellId,
		sessionId,
		cols: 80,
		rows: 24,
		process: { pid: 4242, write: () => {}, resize: () => {}, kill: () => {} },
	});

	return sessionId;
}

describe("daemon router", () => {
	it("names the shells the daemon holds, so the app never reads its own", async () => {
		const daemon = await daemonClient();
		const sessionId = openShell("router-shell");

		expect(await daemon.client.daemon.shells()).toContain("router-shell");

		shellProcesses.close(sessionId);
		daemon.close();
	});

	it("reports the workload the update flow counts before restarting", async () => {
		const daemon = await daemonClient();

		expect(await daemon.client.daemon.workload()).toMatchObject({
			kind: process.platform === "linux" ? "agents" : "shells",
		});

		daemon.close();
	});

	it("refuses to stop when the request did not arrive over loopback", async () => {
		const daemon = await daemonClient(OFF_LOOPBACK_HOST);

		const refusal = await daemon.client.daemon.stop().catch((err: Error) => err);

		expect(refusal).toBeInstanceOf(Error);
		expect(await daemon.client.daemon.shells()).toBeArray();

		daemon.close();
	});

	it("refuses an unauthenticated caller the shell list", async () => {
		const daemon = await daemonClient();

		const response = await fetch(`http://${SERVER_HOST}:${daemon.port}${SERVER_RPC_PREFIX}/daemon/shells`, {
			method: "POST",
		});

		expect(response.status).toBe(401);

		daemon.close();
	});
});
