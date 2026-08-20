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

const COMM_CACHE_TTL_MS = 30_000;

const commCache = { byPid: new Map<number, string>(), filledAt: 0 };

async function named(comm: string): Promise<number[]> {
	const now = Date.now();
	if (now - commCache.filledAt >= COMM_CACHE_TTL_MS) {
		commCache.byPid.clear();
		commCache.filledAt = now;
	}

	const entries = await readdir("/proc").catch((): string[] => []);
	const pids = entries.flatMap((entry) => {
		const pid = Number(entry);
		if (!Number.isInteger(pid)) {
			return [];
		}

		return [pid];
	});
	const live = new Set(pids);

	for (const pid of commCache.byPid.keys()) {
		if (!live.has(pid)) {
			commCache.byPid.delete(pid);
		}
	}

	const unread = pids.filter((pid) => !commCache.byPid.has(pid));
	const read = await Promise.all(
		unread.map(async (pid) => {
			const raw = await readFile(`/proc/${pid}/comm`, "utf8").catch(() => null);

			return { pid, comm: raw?.trim() };
		}),
	);

	for (const entry of read) {
		if (entry.comm !== undefined) {
			commCache.byPid.set(entry.pid, entry.comm);
		}
	}

	return pids.filter((pid) => commCache.byPid.get(pid) === comm);
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

export const ProcFs = { parent, procStart, named, commandLine, openFiles, workingDirectory };
