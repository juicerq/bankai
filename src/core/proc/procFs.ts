import { readFile, readdir } from "node:fs/promises";

type ProcStat = {
	parent: number | null;
	foreground: number | null;
	start: string | null;
};

async function readStat(pid: number): Promise<ProcStat | null> {
	const raw = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => null);
	if (!raw) {
		return null;
	}

	const fields = raw.slice(raw.lastIndexOf(")") + 2).split(" ");
	const parent = Number(fields[1]);
	const foreground = Number(fields[5]);
	const start = fields[19];

	return {
		parent: Number.isInteger(parent) ? parent : null,
		foreground: Number.isInteger(foreground) && foreground > 0 ? foreground : null,
		start: start === undefined ? null : start,
	};
}

async function pids(): Promise<number[]> {
	const entries = await readdir("/proc");
	return entries.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function parent(pid: number): Promise<number | null> {
	const stat = await readStat(pid);
	return stat ? stat.parent : null;
}

async function procStart(pid: number): Promise<string | null> {
	const stat = await readStat(pid);
	return stat ? stat.start : null;
}

async function foreground(pid: number): Promise<number | null> {
	const stat = await readStat(pid);
	return stat ? stat.foreground : null;
}

async function cmdline(pid: number): Promise<string[] | null> {
	const raw = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => null);
	if (raw === null) {
		return null;
	}

	const argv = raw.split("\0").filter((part) => part.length > 0);
	return argv.length > 0 ? argv : null;
}

export const procFs = { pids, parent, procStart, foreground, cmdline };
