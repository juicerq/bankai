import type { ContinuityValue } from "@shared/continuity";
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

export interface ActivityChanges {
	started: string[];
	needsAttention: string[];
	done: string[];
}

function changes(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): ActivityChanges {
	const result: ActivityChanges = { started: [], needsAttention: [], done: [] };

	for (const [sessionId, state] of after) {
		if (turnOpen(state) && !turnOpen(before.get(sessionId))) {
			result.started.push(sessionId);
		}
		if (state === "needs-attention" && before.get(sessionId) !== "needs-attention") {
			result.needsAttention.push(sessionId);
		}
		if (state === "done" && before.get(sessionId) !== "done") {
			result.done.push(sessionId);
		}
	}

	return result;
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
	started: readonly string[];
	after: ReadonlyMap<string, AgentActivityState>;
	owners: ReadonlyMap<string, ShellOwner>;
	previousWorktrees: ReadonlyMap<string, string>;
	worktrees: ReadonlyMap<string, string>;
}): { owner: ShellOwner; worktree?: string }[] {
	const capture = new Map<string, ShellOwner>();

	for (const sessionId of input.started) {
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

interface ShellEntry<T> {
	projectId: string;
	shellId: string;
	value: T;
}

function byProject<T>(entries: ShellEntry<T>[]): Map<string, Record<string, T>> {
	const grouped = new Map<string, Record<string, T>>();
	for (const { projectId, shellId, value } of entries) {
		const bucket = grouped.get(projectId) ?? {};
		bucket[shellId] = value;
		grouped.set(projectId, bucket);
	}

	return grouped;
}

function ownedEntries<T>(
	owners: Map<string, ShellOwner>,
	source: ReadonlyMap<string, T>,
): ShellEntry<T>[] {
	const entries: ShellEntry<T>[] = [];
	for (const owner of owners.values()) {
		const value = source.get(owner.shellId);
		if (value === undefined) {
			continue;
		}

		entries.push({ projectId: owner.projectId, shellId: owner.shellId, value });
	}

	return entries;
}

function shellEntries(
	shellStates: Map<string, AgentActivityState>,
	owners: Map<string, ShellOwner>,
	doneShells: ReadonlyMap<string, DoneShell>,
): ShellEntry<AgentActivityState>[] {
	const byShellId = new Map<string, ShellEntry<AgentActivityState>>();
	for (const [sessionId, state] of shellStates) {
		const owner = owners.get(sessionId);
		if (owner === undefined || (state === "done" && !doneShells.has(owner.shellId))) {
			continue;
		}

		byShellId.set(owner.shellId, { projectId: owner.projectId, shellId: owner.shellId, value: state });
	}

	for (const [shellId, done] of doneShells) {
		if (!byShellId.has(shellId)) {
			byShellId.set(shellId, { projectId: done.projectId, shellId, value: "done" });
		}
	}

	return [...byShellId.values()];
}

function statusSinceOf(
	shells: Record<string, AgentActivityState>,
	statusSince: ReadonlyMap<string, number>,
	doneShells: ReadonlyMap<string, DoneShell>,
): Record<string, number> {
	const byShellId: Record<string, number> = {};
	for (const [shellId, state] of Object.entries(shells)) {
		const at = statusSince.get(shellId) ?? (state === "done" ? doneShells.get(shellId)?.at : undefined);
		if (at !== undefined) {
			byShellId[shellId] = at;
		}
	}

	return byShellId;
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
	const shellsByProject = byProject(shellEntries(shellStates, owners, doneShells));
	const worktreesByProject = byProject(ownedEntries(owners, worktrees));
	const harnessesByProject = byProject(ownedEntries(owners, harnesses));

	const projectIds = new Set([
		...shellsByProject.keys(),
		...worktreesByProject.keys(),
		...harnessesByProject.keys(),
	]);

	const snapshots = new Map<string, ProjectActivitySnapshot>();
	for (const projectId of projectIds) {
		const shells = shellsByProject.get(projectId) ?? {};
		snapshots.set(projectId, {
			shells,
			worktreeByShellId: worktreesByProject.get(projectId) ?? {},
			statusSinceByShellId: statusSinceOf(shells, statusSince, doneShells),
			harnessByShellId: harnessesByProject.get(projectId) ?? {},
		});
	}

	return snapshots;
}

export const ShellActivity = {
	next,
	clockSince,
	changes,
	doneShells,
	nextWorktrees,
	turnBaselines,
	owners,
	snapshotsByProject,
};
