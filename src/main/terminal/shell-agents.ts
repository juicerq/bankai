import { readdir, readFile } from "node:fs/promises";

export const SHELL_ID_ENV = "BANKAI_SHELL_ID";

const SHELL_KILL_GRACE_MS = 300;

export const SHELL_KILL_BUDGET_MS = 2_000;

export interface ProcReader {
	pids: () => Promise<number[]>;
	environ: (pid: number) => Promise<string | undefined>;
}

const procFs: ProcReader = {
	pids: async () => {
		if (process.platform !== "linux") {
			return [];
		}

		const entries = await readdir("/proc").catch(() => []);

		return entries.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
	},
	environ: async (pid) => {
		try {
			return await readFile(`/proc/${pid}/environ`, "utf8");
		} catch {
			return;
		}
	},
};

async function shellOf(pid: number, reader: ProcReader = procFs): Promise<string | undefined> {
	const stamp = `${SHELL_ID_ENV}=`;
	const environ = await reader.environ(pid);

	return environ
		?.split("\0")
		.find((entry) => entry.startsWith(stamp))
		?.slice(stamp.length);
}

async function agentsOf(shellId: string, reader: ProcReader = procFs): Promise<number[]> {
	const pids = await reader.pids();
	const agents: number[] = [];

	for (const pid of pids) {
		if (pid === process.pid) {
			continue;
		}

		if ((await shellOf(pid, reader)) === shellId) {
			agents.push(pid);
		}
	}

	return agents;
}

interface TerminateInput {
	shells: { shellId: string; pid: number }[];
	reader?: ProcReader;
	kill?: (pid: number, signal: string) => void;
	graceMs?: number;
	budgetMs?: number;
}

function terminate(input: TerminateInput): Promise<void> {
	return Promise.race([escalate(input), delay(input.budgetMs ?? SHELL_KILL_BUDGET_MS)]);
}

async function escalate(input: TerminateInput): Promise<void> {
	const reader = input.reader ?? procFs;
	const kill = input.kill ?? sendSignal;
	const targets = new Set<number>();

	for (const shell of input.shells) {
		targets.add(shell.pid);

		for (const agent of await agentsOf(shell.shellId, reader)) {
			targets.add(agent);
		}
	}

	for (const pid of targets) {
		kill(pid, "SIGTERM");
	}

	await delay(input.graceMs ?? SHELL_KILL_GRACE_MS);

	const alive = new Set(await reader.pids());

	for (const pid of targets) {
		if (alive.has(pid)) {
			kill(pid, "SIGKILL");
		}
	}
}

function sendSignal(pid: number, signal: string): void {
	try {
		process.kill(pid, signal);
	} catch {}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms).unref?.();
	});
}

export const ShellAgents = {
	proc: procFs,
	of: agentsOf,
	shellOf,
	terminate,
};
