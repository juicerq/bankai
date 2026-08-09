import type { Dirent } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

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

function normalizedProjectPath(input: string) {
	const path = input.trim();
	if (!path) {
		throw new Error("Enter a project directory.");
	}

	const startsAtHome = path === "~" || path.startsWith("~/") || path.startsWith("~\\");
	if (!startsAtHome && !isAbsolute(path)) {
		throw new Error("Project directory must be an absolute path.");
	}

	return expandUserPath(path);
}

async function fileStatus(path: string) {
	return await stat(path).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return null;
		}

		throw error;
	});
}

async function inspectProject(input: string) {
	const path = normalizedProjectPath(input);
	const entry = await fileStatus(path);
	if (entry?.isDirectory()) {
		return { path, state: "directory" as const };
	}

	if (entry) {
		return { path, state: "not-directory" as const };
	}

	const parent = dirname(path);
	const parentEntry = await fileStatus(parent);
	if (parentEntry?.isDirectory()) {
		return { path, parent, state: "creatable" as const };
	}

	return { path, parent, state: "missing-parent" as const };
}

async function ensureProject(input: string) {
	const inspection = await inspectProject(input);
	if (inspection.state === "directory") {
		return inspection.path;
	}

	if (inspection.state === "not-directory") {
		throw new Error(`Not a directory: ${inspection.path}`);
	}

	if (inspection.state === "missing-parent") {
		throw new Error(`Parent directory does not exist: ${inspection.parent}`);
	}

	await mkdir(inspection.path).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "EEXIST") {
			throw error;
		}
	});
	const created = await inspectProject(inspection.path);
	if (created.state !== "directory") {
		throw new Error(`Failed to create directory: ${inspection.path}`);
	}

	return created.path;
}

export const Directories = {
	expandUser: expandUserPath,
	browse: browseDirectories,
	inspectProject,
	ensureProject,
};
