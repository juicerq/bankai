import { describe, expect, it } from "bun:test";
import { SHELL_ID_ENV, SHELL_KILL_BUDGET_MS, ShellAgents } from "@main/terminal/shell-agents";
import { environ, readerOf } from "./utils/proc-reader";

describe("agent processes belonging to a shell", () => {
	it("finds the agent that setsid orphaned away from the shell", async () => {
		const reader = readerOf({
			100: environ({ [SHELL_ID_ENV]: "shell-a", PATH: "/usr/bin" }),
			200: environ({ PATH: "/usr/bin", [SHELL_ID_ENV]: "shell-a" }),
			300: environ({ [SHELL_ID_ENV]: "shell-b" }),
			400: environ({ PATH: "/usr/bin" }),
		});

		expect(await ShellAgents.of("shell-a", reader)).toEqual([100, 200]);
	});

	it("does not match a shell id that is only a prefix of another", async () => {
		const reader = readerOf({
			100: environ({ [SHELL_ID_ENV]: "shell-a-long" }),
			200: environ({ OTHER_SHELL_ID: "shell-a" }),
		});

		expect(await ShellAgents.of("shell-a", reader)).toEqual([]);
	});
});

describe("terminating the shells an app launched", () => {
	it("signals the shell and its agent, and nothing from another shell", async () => {
		const reader = readerOf({
			100: environ({ [SHELL_ID_ENV]: "shell-a" }),
			200: environ({ [SHELL_ID_ENV]: "shell-a" }),
			300: environ({ [SHELL_ID_ENV]: "shell-b" }),
		});
		const signals: { pid: number; signal: string }[] = [];

		await ShellAgents.terminate({
			shells: [{ shellId: "shell-a", pid: 100 }],
			reader,
			kill: (pid, signal) => signals.push({ pid, signal }),
			graceMs: 0,
		});

		expect(signals.filter(({ signal }) => signal === "SIGTERM")).toEqual([
			{ pid: 100, signal: "SIGTERM" },
			{ pid: 200, signal: "SIGTERM" },
		]);
		expect(signals.some(({ pid }) => pid === 300)).toBe(false);
	});

	it("escalates to SIGKILL only for what survived the grace window", async () => {
		const table: Record<number, string | undefined> = {
			100: environ({ [SHELL_ID_ENV]: "shell-a" }),
			200: environ({ [SHELL_ID_ENV]: "shell-a" }),
			300: environ({ [SHELL_ID_ENV]: "shell-a" }),
		};
		const signals: { pid: number; signal: string }[] = [];

		await ShellAgents.terminate({
			shells: [{ shellId: "shell-a", pid: 100 }],
			reader: readerOf(table),
			kill: (pid, signal) => {
				signals.push({ pid, signal });

				if (pid !== 300) {
					delete table[pid];
				}
			},
			graceMs: 0,
		});

		expect(signals.filter(({ signal }) => signal === "SIGKILL")).toEqual([{ pid: 300, signal: "SIGKILL" }]);
	});

	it("still signals a shell whose environ can no longer be read", async () => {
		const signals: number[] = [];

		await ShellAgents.terminate({
			shells: [{ shellId: "shell-a", pid: 100 }],
			reader: readerOf({ 100: undefined }),
			kill: (pid) => signals.push(pid),
			graceMs: 0,
		});

		expect(signals).toContain(100);
	});

	it("gives up within its budget when reading the process table hangs", async () => {
		const started = Date.now();

		await ShellAgents.terminate({
			shells: [{ shellId: "shell-a", pid: 100 }],
			reader: { pids: () => new Promise(() => {}), environ: () => new Promise(() => {}) },
			kill: () => {},
			budgetMs: 20,
		});

		expect(Date.now() - started).toBeLessThan(SHELL_KILL_BUDGET_MS);
	});
});
