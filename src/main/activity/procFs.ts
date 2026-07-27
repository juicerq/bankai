import { readFile } from "node:fs/promises";

interface ProcStat {
	parent: number | null;
	start: string | null;
}

async function readStat(pid: number): Promise<ProcStat | null> {
	const raw = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => null);
	if (!raw) {
		return null;
	}

	const fields = raw.slice(raw.lastIndexOf(")") + 2).split(" ");
	const parent = Number(fields[1]);
	const start = fields[19];

	return {
		parent: Number.isInteger(parent) ? parent : null,
		start: start === undefined ? null : start,
	};
}

async function parent(pid: number): Promise<number | null> {
	const stat = await readStat(pid);
	return stat?.parent ?? null;
}

async function procStart(pid: number): Promise<string | null> {
	const stat = await readStat(pid);
	return stat?.start ?? null;
}

export const procFs = { parent, procStart };
