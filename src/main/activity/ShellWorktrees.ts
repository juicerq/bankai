import type { AgentActivityState } from "@shared/activity";
import type { Worktree } from "@main/git/contracts";
import { projectWorktrees } from "@main/git/ProjectWorktrees";
import { worktreeContaining } from "@main/git/Worktrees";
import { Logger } from "@main/logger";
import { turnOpen, turnStartShells } from "@main/activity/ShellActivity";
import type { ShellOwner } from "@main/activity/ProjectSnapshots";

export function nextShellWorktrees(
	previous: ReadonlyMap<string, string>,
	observed: { shellId: string; worktree?: string }[],
): Map<string, string> {
	const next = new Map<string, string>();

	for (const shell of observed) {
		const worktree = shell.worktree ?? previous.get(shell.shellId);
		if (worktree) {
			next.set(shell.shellId, worktree);
		}
	}

	return next;
}

export function turnBaselineShells(input: {
	before: ReadonlyMap<string, AgentActivityState>;
	after: ReadonlyMap<string, AgentActivityState>;
	owners: ReadonlyMap<string, ShellOwner>;
	previousWorktrees: ReadonlyMap<string, string>;
	worktrees: ReadonlyMap<string, string>;
}): { owner: ShellOwner; worktree?: string }[] {
	const capture = new Map<string, ShellOwner>();

	for (const sessionId of turnStartShells(input.before, input.after)) {
		const owner = input.owners.get(sessionId);
		if (owner) {
			capture.set(owner.shellId, owner);
		}
	}

	for (const [sessionId, state] of input.after) {
		const owner = input.owners.get(sessionId);
		if (!owner || !turnOpen(state)) {
			continue;
		}

		const worktree = input.worktrees.get(owner.shellId);
		if (worktree && worktree !== input.previousWorktrees.get(owner.shellId)) {
			capture.set(owner.shellId, owner);
		}
	}

	return [...capture.values()].map((owner) => {
		const worktree = input.worktrees.get(owner.shellId);
		if (worktree) {
			return { owner, worktree };
		}

		return { owner };
	});
}

async function locateWorktree(
	projectPath: string,
	cwd: string,
): Promise<Worktree | undefined> {
	const listed = await projectWorktrees(projectPath).catch((err) => {
		Logger.error("activity:worktrees-failed", {
			projectPath,
			err: String(err),
		});
		return [];
	});
	const found = worktreeContaining(listed, cwd);
	if (found) {
		return found;
	}

	const fresh = await projectWorktrees(projectPath, { fresh: true }).catch(
		() => listed,
	);

	return worktreeContaining(fresh, cwd);
}

export function shellOwners(
	shells: { sessionId: string; projectId: string; shellId: string }[],
): Map<string, ShellOwner> {
	return new Map(
		shells.map((shell) => [
			shell.sessionId,
			{ projectId: shell.projectId, shellId: shell.shellId },
		]),
	);
}

export { locateWorktree };
