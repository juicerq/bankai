import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { type } from "arktype";
import { app } from "electron";
import { APP_VERSION } from "@main/infra/app-version";
import { Logger } from "@main/infra/logger";
import { ServerSettings } from "@main/settings/server-settings";
import { SettingsStore } from "@main/store/settings-store";
import type { Router } from "@main/transport/rpc/router";
import {
	DAEMON_ENV_FLAG,
	DAEMON_HELLO_PATH,
	DAEMON_PROTOCOL_VERSION,
	type DaemonHello,
	type DaemonSkew,
	daemonHelloSchema,
} from "@shared/daemon";
import { SERVER_HOST, SERVER_RPC_PREFIX, type ServerReach } from "@shared/server";

const HELLO_TIMEOUT_MS = 1_000;
const READY_POLL_MS = 100;
const READY_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 5_000;

const CLOSE_INHERITED_FDS =
	'for fd in /proc/self/fd/*; do case "${fd##*/}" in 0|1|2) ;; *) eval "exec ${fd##*/}>&-" 2>/dev/null;; esac; done; exec "$0" "$@"';

type DaemonProbe =
	| { kind: "silent" }
	| { kind: "stranger" }
	| { kind: "daemon"; hello: DaemonHello };

function speaksForThisBuild(hello: DaemonHello): boolean {
	return hello.protocolVersion === DAEMON_PROTOCOL_VERSION && hello.appVersion === APP_VERSION;
}

async function daemonPort(): Promise<number> {
	return ServerSettings.port((await SettingsStore.read()).server?.port);
}

async function daemonReach(): Promise<ServerReach> {
	const { server } = await SettingsStore.read();

	if (!server) {
		throw new Error("The Bankai daemon has not published a token yet");
	}

	return { port: ServerSettings.port(server.port), token: server.token };
}

async function probeDaemon(): Promise<DaemonProbe> {
	const port = await daemonPort();
	const response = await fetch(`http://${SERVER_HOST}:${port}${DAEMON_HELLO_PATH}`, {
		signal: AbortSignal.timeout(HELLO_TIMEOUT_MS),
	}).catch(() => null);

	if (!response) {
		return { kind: "silent" };
	}

	const body = await response.json().catch(() => null);
	const hello = daemonHelloSchema(body);

	if (!response.ok || hello instanceof type.errors) {
		Logger.warn("daemon:port-holds-a-stranger", { port, status: response.status });

		return { kind: "stranger" };
	}

	return { kind: "daemon", hello };
}

function daemonCommand(): { command: string; args: string[] } {
	if (!app.isPackaged) {
		return { command: process.execPath, args: [app.getAppPath()] };
	}

	return { command: process.env.APPIMAGE ?? process.execPath, args: [] };
}

function spawnDaemon(): void {
	const { command, args } = daemonCommand();
	const env: NodeJS.ProcessEnv = { ...process.env, [DAEMON_ENV_FLAG]: "1" };

	delete env.ELECTRON_RUN_AS_NODE;

	if (!app.isPackaged) {
		const ephemeral = spawn(command, args, { env, stdio: "ignore" });
		app.once("quit", () => ephemeral.kill());

		return;
	}

	const child = process.platform === "linux"
		? spawn("sh", ["-c", CLOSE_INHERITED_FDS, command, ...args], { env, detached: true, stdio: "ignore" })
		: spawn(command, args, { env, detached: true, stdio: "ignore" });

	child.unref();
}

async function stopDaemon(): Promise<void> {
	const running = await probeDaemon();

	if (running.kind !== "daemon") {
		return;
	}

	Logger.info("daemon:stop-requested", { pid: running.hello.pid, appVersion: running.hello.appVersion });
	await client.daemon.stop().catch((err: unknown) => {
		Logger.warn("daemon:stop-unanswered", { err: String(err) });
	});

	const deadline = Date.now() + STOP_TIMEOUT_MS;

	while (Date.now() < deadline) {
		await sleep(READY_POLL_MS);

		const probe = await probeDaemon();

		if (probe.kind !== "daemon" || probe.hello.pid !== running.hello.pid) {
			return;
		}
	}

	throw new Error(`The Bankai daemon on ${SERVER_HOST}:${await daemonPort()} did not stop`);
}

async function retireOutdatedDaemon(hello: DaemonHello): Promise<boolean> {
	const workload = await client.daemon.workload().catch((err: unknown) => {
		Logger.warn("daemon:workload-unreadable", { err: String(err) });

		return null;
	});

	if (!workload || workload.count > 0) {
		Logger.warn("daemon:version-skew", {
			daemon: hello.appVersion,
			app: APP_VERSION,
			daemonProtocol: hello.protocolVersion,
			protocol: DAEMON_PROTOCOL_VERSION,
			workload: workload?.count,
		});

		return false;
	}

	await stopDaemon();

	return true;
}

async function daemonSkew(): Promise<DaemonSkew | null> {
	const probe = await probeDaemon();

	if (probe.kind !== "daemon" || speaksForThisBuild(probe.hello)) {
		return null;
	}

	return { daemonVersion: probe.hello.appVersion, appVersion: APP_VERSION };
}

async function ensureDaemon(): Promise<void> {
	const probe = await probeDaemon();

	if (probe.kind === "stranger") {
		throw new Error(await portTakenMessage());
	}

	if (probe.kind === "daemon") {
		if (speaksForThisBuild(probe.hello)) {
			return;
		}

		if (!(await retireOutdatedDaemon(probe.hello))) {
			return;
		}

		if ((await probeDaemon()).kind === "daemon") {
			return;
		}
	}

	Logger.info("daemon:spawning", { packaged: app.isPackaged });
	spawnDaemon();

	const deadline = Date.now() + READY_TIMEOUT_MS;

	while (Date.now() < deadline) {
		await sleep(READY_POLL_MS);

		const started = await probeDaemon();

		if (started.kind === "daemon") {
			Logger.info("daemon:ready", {
				pid: started.hello.pid,
				appVersion: started.hello.appVersion,
			});

			return;
		}
	}

	throw new Error(
		`The Bankai daemon did not answer on ${SERVER_HOST}:${await daemonPort()} within ${
			READY_TIMEOUT_MS / 1000
		}s. Another program may be holding that port.`,
	);
}

async function portTakenMessage(): Promise<string> {
	return `Bankai cannot start: port ${await daemonPort()} on ${SERVER_HOST} is held by something that is not Bankai. Free it or change the server port in settings.`;
}

const link = new RPCLink({
	url: async () => `http://${SERVER_HOST}:${(await daemonReach()).port}${SERVER_RPC_PREFIX}`,
	headers: async () => ({ authorization: `Bearer ${(await daemonReach()).token}` }),
});

const client: RouterClient<Router> = createORPCClient(link);

async function restartDaemon(): Promise<void> {
	await stopDaemon();
	await ensureDaemon();
}

export const DaemonClient = {
	ensure: ensureDaemon,
	probe: probeDaemon,
	reach: daemonReach,
	restart: restartDaemon,
	skew: daemonSkew,
	stop: stopDaemon,
	shells: client.daemon.shells,
	workload: client.daemon.workload,
};
