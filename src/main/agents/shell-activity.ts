import type { ContinuityValue } from "@main/store/continuity";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

type BoundStatus = "working" | "waiting" | "idle";

export interface ShellOwner {
	projectId: string;
	shellId: string;
}

export interface DoneShell {
	projectId: string;
	at: number;
}

function deriveShellActivity(
	previous: AgentActivityState | undefined,
	bound: BoundStatus | undefined,
): AgentActivityState | undefined {
	if (bound === "working") {
		return "working";
	}

	const wasActive = previous === "working" || previous === "needs-attention";
	if (!wasActive) {
		return previous;
	}
	if (bound === "idle") {
		return "done";
	}

	return undefined;
}

function next(
	previous: AgentActivityState | undefined,
	bound?: BoundStatus,
): AgentActivityState | undefined {
	if (bound === "waiting") {
		return "needs-attention";
	}

	return deriveShellActivity(previous, bound);
}

function clockSince(input: {
	previous: AgentActivityState | undefined;
	next: AgentActivityState | undefined;
	held: number | undefined;
	reported: number | undefined;
}): number | undefined {
	if (input.next !== input.previous) {
		return input.reported;
	}

	return input.held ?? input.reported;
}

function turnOpen(state: AgentActivityState | undefined): boolean {
	return state === "working" || state === "needs-attention";
}

function turnStarts(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const started: string[] = [];

	for (const [sessionId, state] of after) {
		if (turnOpen(state) && !turnOpen(before.get(sessionId))) {
			started.push(sessionId);
		}
	}

	return started;
}

function attentionEntries(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const entered: string[] = [];

	for (const [sessionId, state] of after) {
		if (state === "needs-attention" && before.get(sessionId) !== "needs-attention") {
			entered.push(sessionId);
		}
	}

	return entered;
}

function doneEntries(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const finished: string[] = [];

	for (const [sessionId, state] of after) {
		if (state === "done" && before.get(sessionId) !== "done") {
			finished.push(sessionId);
		}
	}

	return finished;
}

function doneShells(value: ContinuityValue): Map<string, DoneShell> {
	const done = new Map<string, DoneShell>();

	for (const workspace of value.workspaces) {
		for (const shell of workspace.shells) {
			if (shell.doneAt === undefined || shell.archivedAt !== undefined) {
				continue;
			}

			done.set(shell.id, { projectId: workspace.projectId, at: shell.doneAt });
		}
	}

	return done;
}

function nextWorktrees(
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

function turnBaselines(input: {
	before: ReadonlyMap<string, AgentActivityState>;
	after: ReadonlyMap<string, AgentActivityState>;
	owners: ReadonlyMap<string, ShellOwner>;
	previousWorktrees: ReadonlyMap<string, string>;
	worktrees: ReadonlyMap<string, string>;
}): { owner: ShellOwner; worktree?: string }[] {
	const capture = new Map<string, ShellOwner>();

	for (const sessionId of turnStarts(input.before, input.after)) {
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

function owners(
	shells: { sessionId: string; projectId: string; shellId: string }[],
): Map<string, ShellOwner> {
	return new Map(
		shells.map((shell) => [
			shell.sessionId,
			{ projectId: shell.projectId, shellId: shell.shellId },
		]),
	);
}

function snapshotsByProject({
	shellStates,
	owners,
	worktrees,
	statusSince,
	harnesses,
	doneShells,
}: {
	shellStates: Map<string, AgentActivityState>;
	owners: Map<string, ShellOwner>;
	worktrees: Map<string, string>;
	statusSince: ReadonlyMap<string, number>;
	harnesses: ReadonlyMap<string, string>;
	doneShells: ReadonlyMap<string, DoneShell>;
}): Map<string, ProjectActivitySnapshot> {
	const projectIds = new Set<string>();
	const shellsByProject = new Map<string, Record<string, AgentActivityState>>();
	for (const [sessionId, state] of shellStates) {
		const owner = owners.get(sessionId);
		if (owner === undefined || (state === "done" && !doneShells.has(owner.shellId))) {
			continue;
		}

		const grouped = shellsByProject.get(owner.projectId) ?? {};
		grouped[owner.shellId] = state;
		shellsByProject.set(owner.projectId, grouped);
		projectIds.add(owner.projectId);
	}

	for (const [shellId, done] of doneShells) {
		const grouped = shellsByProject.get(done.projectId) ?? {};
		if (grouped[shellId] === undefined) {
			grouped[shellId] = "done";
		}
		shellsByProject.set(done.projectId, grouped);
		projectIds.add(done.projectId);
	}

	const worktreesByProject = new Map<string, Record<string, string>>();
	for (const owner of owners.values()) {
		const worktree = worktrees.get(owner.shellId);
		if (worktree === undefined) {
			continue;
		}

		const grouped = worktreesByProject.get(owner.projectId) ?? {};
		grouped[owner.shellId] = worktree;
		worktreesByProject.set(owner.projectId, grouped);
		projectIds.add(owner.projectId);
	}

	const harnessesByProject = new Map<string, Record<string, string>>();
	for (const owner of owners.values()) {
		const harness = harnesses.get(owner.shellId);
		if (harness === undefined) {
			continue;
		}

		const grouped = harnessesByProject.get(owner.projectId) ?? {};
		grouped[owner.shellId] = harness;
		harnessesByProject.set(owner.projectId, grouped);
		projectIds.add(owner.projectId);
	}

	const snapshots = new Map<string, ProjectActivitySnapshot>();
	for (const projectId of projectIds) {
		const shells = shellsByProject.get(projectId) ?? {};
		const statusSinceByShellId: Record<string, number> = {};
		for (const shellId of Object.keys(shells)) {
			const since =
				statusSince.get(shellId) ??
				(shells[shellId] === "done" ? doneShells.get(shellId)?.at : undefined);
			if (since !== undefined) {
				statusSinceByShellId[shellId] = since;
			}
		}

		snapshots.set(projectId, {
			shells,
			worktreeByShellId: worktreesByProject.get(projectId) ?? {},
			statusSinceByShellId,
			harnessByShellId: harnessesByProject.get(projectId) ?? {},
		});
	}

	return snapshots;
}

export const ShellActivity = {
	next,
	clockSince,
	turnStarts,
	attentionEntries,
	doneEntries,
	doneShells,
	nextWorktrees,
	turnBaselines,
	owners,
	snapshotsByProject,
};
