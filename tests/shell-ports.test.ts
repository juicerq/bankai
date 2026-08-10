import { describe, expect, it } from "bun:test";
import { SHELL_ID_ENV } from "@main/terminal/shell-agents";
import { ShellPorts } from "@main/terminal/shell-ports";
import { ShellPortsSchemas } from "@shared/shell-ports";
import { environ, readerOf } from "./utils/proc-reader";

const listing = [
	"p1001",
	"cnode",
	"f22",
	"n*:3000",
	"p1002",
	"cpostgres",
	"f7",
	"n192.168.1.10:5432",
	"p1003",
	"cbun",
	"f10",
	"n127.0.0.1:5173",
	"f11",
	"n[::1]:5173",
	"f12",
	"n[::]:4000",
	"p1004",
	"cnode",
	"f9",
	"n*:9229",
	"",
].join("\n");

const reader = readerOf({
	1001: environ({ [SHELL_ID_ENV]: "shell-a", PATH: "/usr/bin" }),
	1002: environ({ [SHELL_ID_ENV]: "shell-a" }),
	1003: environ({ PATH: "/usr/bin", [SHELL_ID_ENV]: "shell-a" }),
	1004: environ({ [SHELL_ID_ENV]: "shell-b" }),
});

function watching({
	output,
	shellIds,
	reader: proc = reader,
}: {
	output: string;
	shellIds: string[];
	reader?: Parameters<typeof ShellPorts.watcher>[0]["reader"];
}) {
	const sent: unknown[] = [];
	const watcher = ShellPorts.watcher({
		send: (detected) => sent.push(detected),
		shells: () => shellIds,
		scan: async () => output,
		reader: proc,
	});

	return { sent, tick: () => watcher.tick() };
}

describe("ports a shell listens on", () => {
	it("groups every loopback port under the shell that owns the process, lowest first", async () => {
		const watcher = watching({ output: listing, shellIds: ["shell-a", "shell-b"] });

		await watcher.tick();

		expect(watcher.sent).toEqual([{ "shell-a": [3000, 4000, 5173], "shell-b": [9229] }]);
	});

	it("drops a port published on a routable address", async () => {
		const watcher = watching({
			output: ["p1003", "cbun", "n127.0.0.1:5173", "n192.168.1.10:5432", ""].join("\n"),
			shellIds: ["shell-a"],
		});

		await watcher.tick();

		expect(watcher.sent).toEqual([{ "shell-a": [5173] }]);
	});

	it("ignores a listener that no live shell owns", async () => {
		const watcher = watching({ output: listing, shellIds: ["shell-a"] });

		await watcher.tick();

		expect(watcher.sent).toEqual([{ "shell-a": [3000, 4000, 5173] }]);
	});

	it("reads no process table when nothing is listening", async () => {
		let reads = 0;
		const watcher = watching({
			output: "",
			shellIds: ["shell-a"],
			reader: {
				pids: async () => [],
				environ: async () => {
					reads += 1;

					return;
				},
			},
		});

		await watcher.tick();

		expect(watcher.sent).toEqual([]);
		expect(reads).toBe(0);
	});
});

describe("the shell ports contract", () => {
	it("accepts a detection and refuses a port outside the TCP range", () => {
		expect(ShellPortsSchemas.detected.assert({ "shell-a": [3000, 5173] })).toEqual({ "shell-a": [3000, 5173] });
		expect(ShellPortsSchemas.detected.assert({})).toEqual({});
		expect(() => ShellPortsSchemas.detected.assert({ "shell-a": [70000] })).toThrow();
		expect(() => ShellPortsSchemas.detected.assert({ "shell-a": [3000.5] })).toThrow();
		expect(() => ShellPortsSchemas.detected.assert({ "shell-a": ["3000"] })).toThrow();
	});
});

describe("watching the ports of live shells", () => {
	it("pushes a detection once and stays quiet while it does not change", async () => {
		const watcher = watching({ output: listing, shellIds: ["shell-a"] });

		await watcher.tick();
		await watcher.tick();

		expect(watcher.sent).toEqual([{ "shell-a": [3000, 4000, 5173] }]);

		await watcher.tick();

		expect(watcher.sent).toHaveLength(1);
	});

	it("does not look at sockets while no shell is live", async () => {
		const sent: unknown[] = [];
		let scans = 0;
		let live: string[] = [];
		const watcher = ShellPorts.watcher({
			send: (detected) => sent.push(detected),
			shells: () => live,
			scan: async () => {
				scans += 1;

				return listing;
			},
			reader,
		});

		await watcher.tick();

		expect(scans).toBe(0);
		expect(sent).toEqual([]);

		live = ["shell-a"];
		await watcher.tick();

		expect(scans).toBe(1);
		expect(sent).toEqual([{ "shell-a": [3000, 4000, 5173] }]);

		live = [];
		await watcher.tick();

		expect(sent).toEqual([{ "shell-a": [3000, 4000, 5173] }, {}]);
	});

	it("gives up for good when the socket listing is unavailable", async () => {
		const sent: unknown[] = [];
		let scans = 0;
		const watcher = ShellPorts.watcher({
			send: (detected) => sent.push(detected),
			shells: () => ["shell-a"],
			scan: async () => {
				scans += 1;

				return;
			},
			reader,
		});

		await watcher.tick();
		await watcher.tick();

		expect(scans).toBe(1);
		expect(sent).toEqual([]);
	});
});
