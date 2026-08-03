import { readdir, readFile, readlink } from "node:fs/promises";

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

async function named(comm: string): Promise<number[]> {
	const entries = await readdir("/proc").catch((): string[] => []);
	const pids = entries.flatMap((entry) => {
		const pid = Number(entry);
		if (!Number.isInteger(pid)) {
			return [];
		}

		return [pid];
	});
	const matched = await Promise.all(
		pids.map(async (pid) => {
			const raw = await readFile(`/proc/${pid}/comm`, "utf8").catch(() => null);
			if (raw?.trim() !== comm) {
				return null;
			}

			return pid;
		}),
	);

	return matched.flatMap((pid) => pid ?? []);
}

async function commandLine(pid: number): Promise<string[] | null> {
	const raw = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => null);
	if (raw === null) {
		return null;
	}

	return raw.split("\0").filter((argument) => argument !== "");
}

async function workingDirectory(pid: number): Promise<string | null> {
	return await readlink(`/proc/${pid}/cwd`).catch(() => null);
}

async function openFiles(pid: number): Promise<string[]> {
	const descriptors = await readdir(`/proc/${pid}/fd`).catch((): string[] => []);
	const targets = await Promise.all(
		descriptors.map((descriptor) => readlink(`/proc/${pid}/fd/${descriptor}`).catch(() => null)),
	);

	return targets.flatMap((target) => target ?? []);
}

export const procFs = { parent, procStart, named, commandLine, openFiles, workingDirectory };
