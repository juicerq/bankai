import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { APP_VERSION } from "@main/infra/app-version";
import { DaemonProbes } from "@main/daemon/daemon-probes";
import { DaemonClient } from "@main/desktop/daemon-client";
import { BankaiServer } from "@main/transport/server/bankai-server";
import { Reach } from "@main/transport/server/server-reach";
import { ServerListen } from "@main/transport/server/server-listen";
import { shellProcesses } from "@main/terminal/shell-processes";
import { DAEMON_HELLO_PATH, DAEMON_PROTOCOL_VERSION, type DaemonHello } from "@shared/daemon";
import { SERVER_HOST } from "@shared/server";
import type { UpdateWorkload } from "@shared/update";
import { assertDefined } from "./utils/assertions";

const storedPort = process.env.SERVER_PORT;

function boundPort(server: Server): number {
	const address = server.address();

	if (typeof address !== "object" || address === null) {
		throw new Error("expected a bound TCP address");
	}

	return address.port;
}

async function listenAsReach(server: Server) {
	await ServerListen.on(server, { port: 0, host: SERVER_HOST });
	process.env.SERVER_PORT = String(boundPort(server));
}

async function runningDaemon() {
	const server = BankaiServer.create();
	await listenAsReach(server);
	await Reach.open();

	return { close: () => server.close() };
}

async function outdatedDaemon(input: { workload: UpdateWorkload }) {
	const stops: string[] = [];
	let hello: DaemonHello = {
		protocolVersion: DAEMON_PROTOCOL_VERSION,
		appVersion: "0.0.1-ancient",
		pid: 4242,
	};

	const server = createServer((req, res) => {
		if (req.url === DAEMON_HELLO_PATH) {
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(hello));
			return;
		}

		if (req.url?.endsWith("/daemon/workload")) {
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ json: input.workload }));
			return;
		}

		if (req.url?.endsWith("/daemon/stop")) {
			stops.push(req.url);
			hello = { protocolVersion: DAEMON_PROTOCOL_VERSION, appVersion: APP_VERSION, pid: hello.pid + 1 };
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ json: null }));
			return;
		}

		res.writeHead(404).end();
	});

	await listenAsReach(server);
	await Reach.open();

	return { stops, close: () => server.close() };
}

async function strangerOnThePort() {
	const server = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "text/html" }).end("<html>not bankai</html>");
	});

	await listenAsReach(server);

	return { port: boundPort(server), close: () => server.close() };
}

function loggedEvents(): { message: string; data?: Record<string, unknown> }[] {
	assertDefined(process.env.DATA_DIR);

	const path = join(process.env.DATA_DIR, "log.ndjson");
	const raw = readFileSync(path, "utf8").trim();

	if (!raw) {
		return [];
	}

	return raw.split("\n").map((line) => JSON.parse(line));
}

afterEach(() => {
	if (storedPort === undefined) {
		delete process.env.SERVER_PORT;
		return;
	}

	process.env.SERVER_PORT = storedPort;
});

describe("daemon probe", () => {
	it("recognizes a daemon of this very build", async () => {
		const daemon = await runningDaemon();

		expect(await DaemonClient.probe()).toEqual({
			kind: "daemon",
			hello: {
				protocolVersion: DAEMON_PROTOCOL_VERSION,
				appVersion: APP_VERSION,
				pid: process.pid,
			},
		});

		daemon.close();
	});

	it("leaves a mark on the daemon, so an idle one does not die under a booting app", async () => {
		const daemon = await runningDaemon();
		const reached = Date.now();

		await DaemonClient.probe();

		expect(DaemonProbes.lastAt()).toBeGreaterThanOrEqual(reached);

		daemon.close();
	});

	it("reports silence when nothing listens on the reach port", async () => {
		const daemon = await runningDaemon();
		daemon.close();

		expect(await DaemonClient.probe()).toEqual({ kind: "silent" });
	});

	it("reports a stranger when the port answers something that is not a hello", async () => {
		const stranger = await strangerOnThePort();

		expect(await DaemonClient.probe()).toEqual({ kind: "stranger" });

		stranger.close();
	});
});

describe("daemon client", () => {
	it("adopts the daemon already listening instead of starting a second one", async () => {
		const daemon = await runningDaemon();

		expect(await DaemonClient.ensure()).toBeUndefined();
		expect(await DaemonClient.probe()).toMatchObject({ hello: { pid: process.pid } });

		daemon.close();
	});

	it("names the port and the remedy when another program holds it", async () => {
		const stranger = await strangerOnThePort();

		const failure = await DaemonClient.ensure().catch((err: Error) => err.message);

		expect(failure).toInclude(String(stranger.port));
		expect(failure).toInclude("server port");

		stranger.close();
	});

	it("reads the reach the daemon persisted so the renderer pairs with it", async () => {
		const daemon = await runningDaemon();
		await DaemonClient.ensure();

		expect(await DaemonClient.reach()).toEqual(Reach.current());

		daemon.close();
	});

	it("reads the daemon's shells and workload over the wire", async () => {
		const daemon = await runningDaemon();
		await DaemonClient.ensure();
		const sessionId = "session-client-shell";

		shellProcesses.register({
			projectId: "daemon-client",
			shellId: "client-shell",
			sessionId,
			process: { pid: 4242, write: () => {}, resize: () => {}, kill: () => {} },
		});

		expect(await DaemonClient.shells()).toContain("client-shell");
		expect(await DaemonClient.workload()).toMatchObject({
			kind: process.platform === "linux" ? "agents" : "shells",
		});

		shellProcesses.close(sessionId);
		daemon.close();
	});
});

describe("daemon of another build", () => {
	it("stops an outdated daemon that holds no work", async () => {
		const outdated = await outdatedDaemon({ workload: { kind: "agents", count: 0 } });

		await DaemonClient.ensure();

		expect(outdated.stops).toHaveLength(1);

		outdated.close();
	});

	it("keeps an outdated daemon that is still working, and says so in the log", async () => {
		const outdated = await outdatedDaemon({ workload: { kind: "agents", count: 3 } });

		await DaemonClient.ensure();

		expect(outdated.stops).toEqual([]);

		const skew = loggedEvents().find((event) => event.message === "daemon:version-skew");

		expect(skew?.data).toMatchObject({ daemon: "0.0.1-ancient", app: APP_VERSION });

		outdated.close();
	});

	it("reads the adopted daemon's version off the wire so the window can say so", async () => {
		const outdated = await outdatedDaemon({ workload: { kind: "agents", count: 3 } });

		await DaemonClient.ensure();

		expect(await DaemonClient.skew()).toEqual({ daemonVersion: "0.0.1-ancient", appVersion: APP_VERSION });

		outdated.close();
	});

	it("reports no skew once the daemon speaks for this build", async () => {
		const daemon = await runningDaemon();

		await DaemonClient.ensure();

		expect(await DaemonClient.skew()).toBeNull();

		daemon.close();
	});

	it("reports no skew when nothing holds the port", async () => {
		const daemon = await runningDaemon();
		daemon.close();

		expect(await DaemonClient.skew()).toBeNull();
	});

	it("restarting replaces the adopted daemon and clears the skew", async () => {
		const outdated = await outdatedDaemon({ workload: { kind: "agents", count: 3 } });
		await DaemonClient.ensure();

		await DaemonClient.restart();

		expect(outdated.stops).toHaveLength(1);
		expect(await DaemonClient.skew()).toBeNull();

		outdated.close();
	});
});

describe("stopping the daemon", () => {
	it("waits for the running daemon to hand the port over", async () => {
		const outdated = await outdatedDaemon({ workload: { kind: "agents", count: 3 } });

		await DaemonClient.stop();

		expect(outdated.stops).toHaveLength(1);

		outdated.close();
	});

	it("returns at once when no daemon holds the port", async () => {
		const daemon = await runningDaemon();
		daemon.close();

		expect(await DaemonClient.stop()).toBeUndefined();
	});
});
