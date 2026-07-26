import { access, readFile, readdir } from "node:fs/promises";

interface ProcStat {
	parent: number | null;
	foreground: number | null;
	start: string | null;
}

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
	const entries = await readdir("/proc").catch((): string[] => []);
	return entries.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function parent(pid: number): Promise<number | null> {
	const stat = await readStat(pid);
	return stat?.parent ?? null;
}

async function procStart(pid: number): Promise<string | null> {
	const stat = await readStat(pid);
	return stat?.start ?? null;
}

async function foreground(pid: number): Promise<number | null> {
	const stat = await readStat(pid);
	return stat?.foreground ?? null;
}

function childrenPath(pid: number, tid: number | string): string {
	return `/proc/${pid}/task/${tid}/children`;
}

async function children(pid: number): Promise<number[]> {
	const tids = await readdir(`/proc/${pid}/task`).catch((): string[] => []);
	const listed = await Promise.all(
		tids.map((tid) => readFile(childrenPath(pid, tid), "utf8").catch(() => "")),
	);

	return listed
		.flatMap((raw) => raw.split(/\s+/))
		.map(Number)
		.filter((child) => Number.isInteger(child) && child > 0);
}

let childrenSupport: Promise<boolean> | undefined;

async function supportsChildren(): Promise<boolean> {
	childrenSupport ??= access(childrenPath(process.pid, process.pid)).then(() => true, () => false);

	return await childrenSupport;
}

export const procFs = { pids, parent, procStart, foreground, children, supportsChildren };
