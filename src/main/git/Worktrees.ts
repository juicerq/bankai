import { resolve, sep } from "node:path";
import type { Worktree } from "@main/git/contracts";
import { gitText } from "@main/git/run";

export async function readWorktrees(path: string): Promise<Worktree[]> {
	const raw = await gitText(path, ["worktree", "list", "--porcelain"]).catch(() => null);
	if (raw === null) {
		return [];
	}

	return parseWorktrees(raw);
}

export async function removeWorktree(repo: string, worktree: string): Promise<void> {
	await gitText(repo, ["worktree", "remove", worktree]).catch((err: unknown) => {
		throw new Error(worktreeFailure(err));
	});
}

export function worktreeFailure(err: unknown): string {
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

export function parseWorktrees(raw: string): Worktree[] {
	const worktrees: Worktree[] = [];
	let path: string | undefined;
	let branch: string | undefined;
	let usable = true;

	const flush = () => {
		if (path && usable) {
			worktrees.push({ path, ...(branch ? { branch } : {}) });
		}
		path = undefined;
		branch = undefined;
		usable = true;
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
		if (line.startsWith("prunable") || line === "bare") {
			usable = false;
		}
	}
	flush();

	return worktrees;
}

export function worktreeContaining(worktrees: Worktree[], path: string): Worktree | undefined {
	const target = resolve(path);

	return worktrees
		.filter((worktree) => target === worktree.path || target.startsWith(worktree.path + sep))
		.sort((left, right) => right.path.length - left.path.length)
		.at(0);
}
