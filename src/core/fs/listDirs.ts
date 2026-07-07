import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type DirEntry = { name: string; path: string; hidden: boolean };

export async function listDirs(dir: string): Promise<DirEntry[]> {
	const entries = await readdir(dir, { withFileTypes: true });

	const dirs = await Promise.all(
		entries.map(async (entry) => {
			if (!entry.isDirectory() && !entry.isSymbolicLink()) {
				return null;
			}

			const path = join(dir, entry.name);
			const info = await stat(path).catch(() => null);
			if (!info?.isDirectory()) {
				return null;
			}

			return { name: entry.name, path, hidden: entry.name.startsWith("."), mtimeMs: info.mtimeMs };
		}),
	);

	return dirs
		.filter((entry) => entry !== null)
		.sort(
			(a, b) =>
				b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
		)
		.map((entry) => ({ name: entry.name, path: entry.path, hidden: entry.hidden }));
}
