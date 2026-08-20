import { spawn } from "node:child_process";
import { Logger } from "@main/infra/logger";
import { type ProcReader, ShellAgents } from "@main/terminal/shell-agents";
import { shellProcesses } from "@main/terminal/shell-processes";
import { type ShellPortsDetected, ShellPortsSchemas } from "@shared/shell-ports";

const LSOF_ARGS = ["-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "pcn"];
const SCAN_TIMEOUT_MS = 5_000;
const SCAN_MAX_OUTPUT_BYTES = 256 * 1024;
const POLL_INTERVAL_MS = 3_000;

const LOOPBACK_HOSTS = new Set(["*", "localhost", "[::]", "[::1]", "[::ffff:127.0.0.1]"]);

interface Listener {
	pid: number;
	port: number;
}

function isLoopback(host: string): boolean {
	if (LOOPBACK_HOSTS.has(host)) {
		return true;
	}

	const octets = host.split(".");

	return octets.length === 4 && octets[0] === "127";
}

function listenersOf(output: string): Listener[] {
	const listeners: Listener[] = [];
	let pid: number | undefined;

	for (const line of output.split("\n")) {
		const field = line[0];

		if (field === "p") {
			const parsed = Number(line.slice(1));
			pid = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
			continue;
		}

		if (field !== "n" || pid === undefined) {
			continue;
		}

		const address = line.slice(1);
		const separator = address.lastIndexOf(":");

		if (separator < 0 || !isLoopback(address.slice(0, separator))) {
			continue;
		}

		const port = Number(address.slice(separator + 1));

		if (Number.isInteger(port) && port > 0 && port <= 65535) {
			listeners.push({ pid, port });
		}
	}

	return listeners;
}

async function detect({
	output,
	shellIds,
	reader,
}: {
	output: string;
	shellIds: string[];
	reader?: ProcReader;
}): Promise<ShellPortsDetected> {
	const listeners = listenersOf(output);

	if (listeners.length === 0) {
		return {};
	}

	const proc = reader ?? ShellAgents.proc;
	const live = new Set(shellIds);
	const owners = new Map<number, string | undefined>();
	const ports = new Map<string, Set<number>>();

	for (const listener of listeners) {
		if (!owners.has(listener.pid)) {
			owners.set(listener.pid, await ShellAgents.shellOf(listener.pid, proc));
		}

		const shellId = owners.get(listener.pid);

		if (!shellId || !live.has(shellId)) {
			continue;
		}

		const owned = ports.get(shellId) ?? new Set<number>();
		owned.add(listener.port);
		ports.set(shellId, owned);
	}

	const detected: ShellPortsDetected = {};

	for (const shellId of [...ports.keys()].sort()) {
		detected[shellId] = [...(ports.get(shellId) ?? [])].sort((left, right) => left - right);
	}

	return detected;
}

function scan(): Promise<string | undefined> {
	const child = spawn("lsof", LSOF_ARGS, { windowsHide: true });
	const { promise, resolve } = Promise.withResolvers<string | undefined>();
	let output = "";

	const timer = setTimeout(() => child.kill(), SCAN_TIMEOUT_MS);
	timer.unref();

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		if (output.length > SCAN_MAX_OUTPUT_BYTES) {
			child.kill();
			return;
		}

		output += chunk;
	});
	child.once("error", () => {
		clearTimeout(timer);
		resolve();
	});
	child.once("close", () => {
		clearTimeout(timer);
		resolve(output);
	});

	return promise;
}

function watcher({
	send,
	shells,
	scan: read,
	reader,
}: {
	send: (detected: ShellPortsDetected) => void;
	shells: () => string[];
	scan: () => Promise<string | undefined>;
	reader?: ProcReader;
}) {
	let available = true;
	let published = "{}";
	const publish = (detected: ShellPortsDetected) => {
		const encoded = JSON.stringify(detected);

		if (encoded === published) {
			return;
		}

		published = encoded;
		send(ShellPortsSchemas.detected.assert(detected));
	};

	return {
		async tick() {
			if (!available) {
				return;
			}

			const shellIds = shells();

			if (shellIds.length === 0) {
				publish({});
				return;
			}

			const output = await read();

			if (output === undefined) {
				available = false;
				return;
			}

			publish(await detect({ output, shellIds, reader }));
		},
	};
}

function watch(send: (detected: ShellPortsDetected) => void) {
	const running = watcher({
		send,
		shells: () => [...new Set(shellProcesses.list().map((session) => session.shellId))],
		scan,
	});
	const tick = () => {
		running.tick().catch((err) => Logger.warn("shell-ports:scan-failed", { err: String(err) }));
	};
	let timer: ReturnType<typeof setInterval> | undefined;

	const resume = () => {
		if (timer) {
			return;
		}

		timer = setInterval(tick, POLL_INTERVAL_MS);
		timer.unref();
		tick();
	};

	const pause = () => {
		clearInterval(timer);
		timer = undefined;
	};

	resume();

	return { resume, pause };
}

export const ShellPorts = {
	watcher,
	watch,
};
