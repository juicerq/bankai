import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { DiffLine, ReviewContent } from "@main/git/git-contracts";
import { GitRun } from "@main/git/git-run";
import { ImageFile } from "@main/git/image-file";
import { RepoPath } from "@main/git/repo-path";

async function list(path: string): Promise<string[]> {
	const inside = await GitRun.isRepo(path);
	if (!inside) {
		return [];
	}

	const [visible, ignored] = await Promise.all([
		GitRun.text(path, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).then(GitRun.nulPaths),
		GitRun.text(path, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]).then(
			GitRun.nulPaths,
		),
	]);
	const paths = new Set([...visible, ...ignored.filter((entry) => !entry.endsWith("/"))]);

	return [...paths].sort((left, right) => left.localeCompare(right));
}

async function read({ path, file }: { path: string; file: string }): Promise<ReviewContent> {
	await RepoPath.assertWithin({ root: path, file });

	const target = resolve(path, file);
	const stats = await stat(target).catch(() => null);
	if (!stats) {
		return { status: "unavailable" };
	}
	if (stats.size > GitRun.GIT_OUTPUT_MAX_BYTES) {
		return { status: "too-large" };
	}

	const mime = await ImageFile.detect(target);
	if (mime) {
		if (stats.size > ImageFile.MAX_BYTES) {
			return { status: "too-large" };
		}

		const bytes = await readFile(target).catch(() => null);
		if (!bytes) {
			return { status: "unavailable" };
		}

		return { status: "image", mime, data: bytes.toString("base64") };
	}

	const raw = await readFile(target).catch(() => null);
	if (!raw) {
		return { status: "unavailable" };
	}
	if (raw.length === 0) {
		return { status: "empty" };
	}
	if (raw.includes(0)) {
		return { status: "binary" };
	}

	const text = raw.toString("utf8");
	const rows = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");

	return { status: "ready", lines: rows.map(contextLine) };
}

function contextLine(content: string, index: number): DiffLine {
	return { kind: "context", number: index + 1, hunk: 0, content };
}

export const BrowseFiles = {
	list,
	read,
};
