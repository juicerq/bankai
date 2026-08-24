import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DaemonIpc } from "@main/desktop/daemon-ipc";
import { ServerListen } from "@main/transport/server/server-listen";
import { DAEMON_IPC } from "@shared/daemon-ipc";
import { SERVER_HOST } from "@shared/server";
import { errorBoxes, ipcHandlers } from "./utils/electron-mock";

const storedPort = process.env.SERVER_PORT;

async function strangerOnThePort() {
	const server: Server = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "text/html" }).end("<html>not bankai</html>");
	});

	await ServerListen.on(server, { port: 0, host: SERVER_HOST });
	const address = server.address();

	if (typeof address !== "object" || address === null) {
		throw new Error("expected a bound TCP address");
	}

	process.env.SERVER_PORT = String(address.port);

	return { close: () => server.close() };
}

function restart(): Promise<unknown> {
	const handler = ipcHandlers.get(DAEMON_IPC.restart);

	if (!handler) {
		throw new Error(`Missing IPC handler ${DAEMON_IPC.restart}`);
	}

	return Promise.resolve(handler({ sender: {} }));
}

beforeEach(() => {
	ipcHandlers.clear();
	errorBoxes.length = 0;
	DaemonIpc.setup();
});

afterEach(() => {
	if (storedPort === undefined) {
		delete process.env.SERVER_PORT;

		return;
	}

	process.env.SERVER_PORT = storedPort;
});

describe("restarting the core from the window", () => {
	it("tells the user out loud when the core stays down", async () => {
		const stranger = await strangerOnThePort();

		expect(() => restart()).toThrow();

		expect(errorBoxes).toHaveLength(1);
		expect(errorBoxes[0]?.title).toContain("core");

		stranger.close();
	});

	it("names the port that held the core back", async () => {
		const stranger = await strangerOnThePort();

		await restart().catch(() => {});

		expect(errorBoxes[0]?.content).toContain("server port");

		stranger.close();
	});
});
