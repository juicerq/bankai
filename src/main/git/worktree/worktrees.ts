import { resolve, sep } from "node:path";
import type { Worktree } from "@main/git/git-contracts";
import { GitRun } from "@main/git/git-run";

interface ParsedWorktree extends Worktree {
	prunable?: true;
}

async function readWorktrees(path: string): Promise<Worktree[]> {
	const raw = await GitRun.text(path, ["worktree", "list", "--porcelain"]).catch(() => null);
	if (raw === null) {
		return [];
	}

	return parseWorktrees(raw)
		.filter((worktree) => !worktree.prunable)
		.map((worktree) => ({ path: worktree.path, ...(worktree.branch ? { branch: worktree.branch } : {}) }));
}

async function restoreWorktree(repo: string, path: string): Promise<boolean> {
	const raw = await GitRun.text(repo, ["worktree", "list", "--porcelain"]).catch(() => null);
	if (raw === null) {
		return false;
	}

	const worktree = worktreeContaining(parseWorktrees(raw), path);
	if (!worktree?.prunable || !worktree.branch) {
		return false;
	}

	return await GitRun.text(repo, ["worktree", "add", "-f", worktree.path, worktree.branch])
		.then(() => true)
		.catch(() => false);
}

async function removeWorktree(repo: string, worktree: string): Promise<void> {
	await GitRun.text(repo, ["worktree", "remove", worktree]).catch((err: unknown) => {
		throw new Error(worktreeFailure(err));
	});
}

function worktreeFailure(err: unknown): string {
	if (typeof err === "object" && err !== null && "stderr" in err && typeof err.stderr === "string") {
		const stderr = err.stderr.trim();
		if (stderr) {
			return stderr.replace(/^fatal: /, "").split("\n")[0] ?? stderr;
		}
	}

	if (err instanceof Error) {
		return err.message;
	}

	return String(err);
}

function parseWorktrees(raw: string): ParsedWorktree[] {
	const worktrees: ParsedWorktree[] = [];
	let path: string | undefined;
	let branch: string | undefined;
	let bare = false;
	let prunable = false;

	const flush = () => {
		if (path && !bare) {
			worktrees.push({ path, ...(branch ? { branch } : {}), ...(prunable ? { prunable: true } : {}) });
		}
		path = undefined;
		branch = undefined;
		bare = false;
		prunable = false;
	};

	for (const line of raw.split("\n")) {
		if (line.startsWith("worktree ")) {
			flush();
			path = resolve(line.slice("worktree ".length).trim());
			continue;
		}
		if (line.startsWith("branch ")) {
			branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
			continue;
		}
		if (line.startsWith("prunable")) {
			prunable = true;
			continue;
		}
		if (line === "bare") {
			bare = true;
		}
	}
	flush();

	return worktrees;
}

function worktreeContaining<T extends Worktree>(worktrees: T[], path: string): T | undefined {
	const target = resolve(path);

	return worktrees
		.filter((worktree) => target === worktree.path || target.startsWith(worktree.path + sep))
		.sort((left, right) => right.path.length - left.path.length)
		.at(0);
}

export const Worktrees = {
	read: readWorktrees,
	remove: removeWorktree,
	restore: restoreWorktree,
	failure: worktreeFailure,
	parse: parseWorktrees,
	containing: worktreeContaining,
};
