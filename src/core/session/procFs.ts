import { readFile, readdir } from "node:fs/promises";

async function pids(): Promise<number[]> {
	const entries = await readdir("/proc");

	return entries.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function parent(pid: number): Promise<number | null> {
	const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => null);
	if (!stat) {
		return null;
	}

	const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);

	return Number.isInteger(ppid) ? ppid : null;
}

async function procStart(pid: number): Promise<string | null> {
	const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => null);
	if (!stat) {
		return null;
	}

	const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
	if (start === undefined) {
		return null;
	}

	return start;
}

async function cmdline(pid: number): Promise<string[] | null> {
	const raw = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => null);
	if (raw === null) {
		return null;
	}

	const argv = raw.split("\0").filter((part) => part.length > 0);

	return argv.length > 0 ? argv : null;
}

export const procFs = { pids, parent, procStart, cmdline };
