import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function expandUserPath(path: string) {
	if (path === "~") {
		return homedir();
	}

	if (path.startsWith("~/") || path.startsWith("~\\")) {
		return join(homedir(), path.slice(2));
	}

	return resolve(path);
}

async function leadsToDirectory(parent: string, entry: Dirent) {
	if (entry.isDirectory()) {
		return true;
	}

	if (!entry.isSymbolicLink()) {
		return false;
	}

	const target = await stat(join(parent, entry.name)).catch(() => null);

	return !!target?.isDirectory();
}

async function browseDirectories(path: string) {
	const parent = expandUserPath(path);
	const entries = await readdir(parent, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
		if (err.code === "EACCES" || err.code === "EPERM") {
			return [];
		}

		throw err;
	});
	const reachable = await Promise.all(entries.map((entry) => leadsToDirectory(parent, entry)));

	return {
		path: parent,
		directories: entries
			.filter((_, index) => reachable[index])
			.map((entry) => entry.name)
			.toSorted((left, right) => left.localeCompare(right)),
	};
}

export const Directories = {
	expandUser: expandUserPath,
	browse: browseDirectories,
};
