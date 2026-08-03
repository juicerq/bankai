import { resolve } from "node:path";
import type { Worktree } from "@main/git/git-contracts";
import { GitProcess } from "@main/git/git-process";
import { Projects } from "@main/store/projects";

const WORKTREE_LIST_TTL_MS = 2000;

const listings = new Map<string, { readAt: number; worktrees: Promise<Worktree[]> }>();

export async function projectWorktrees(projectPath: string, options?: { fresh: boolean }): Promise<Worktree[]> {
	const cached = listings.get(projectPath);
	if (cached && !options?.fresh && Date.now() - cached.readAt < WORKTREE_LIST_TTL_MS) {
		return await cached.worktrees;
	}

	const worktrees = GitProcess.worktrees({ path: projectPath });
	listings.set(projectPath, { readAt: Date.now(), worktrees });

	return await worktrees.catch((err) => {
		listings.delete(projectPath);
		throw err;
	});
}

export async function resolveProjectWorktree(input: { projectId: string; worktree?: string }): Promise<string> {
	const project = await Projects.find(input.projectId);
	if (!input.worktree) {
		return project.path;
	}

	const requested = resolve(input.worktree);
	if (requested === resolve(project.path)) {
		return project.path;
	}

	const worktrees = await projectWorktrees(project.path);
	if (!worktrees.some((worktree) => worktree.path === requested)) {
		throw new Error(`Worktree does not belong to this project: ${requested}`);
	}

	return requested;
}
