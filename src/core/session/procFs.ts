import { readFile, readdir, readlink } from "node:fs/promises";
import type { ProcSource } from "@core/session/SessionBinder";

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

async function openFiles(pid: number): Promise<string[]> {
	const dir = `/proc/${pid}/fd`;
	const fds = await readdir(dir).catch(() => []);
	const links = await Promise.all(fds.map((fd) => readlink(`${dir}/${fd}`).catch(() => null)));

	return links.filter((link): link is string => link !== null);
}

export const procFs: ProcSource = { pids, parent, openFiles };
