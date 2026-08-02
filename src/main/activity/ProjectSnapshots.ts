import type { ContinuityValue } from "@main/store/continuity";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

export interface ShellOwner {
	projectId: string;
	shellId: string;
}

export interface DoneShell {
	projectId: string;
	at: number;
}

export function doneShells(value: ContinuityValue): Map<string, DoneShell> {
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

function sameDoneShells(left: ReadonlyMap<string, DoneShell>, right: ReadonlyMap<string, DoneShell>): boolean {
	if (left.size !== right.size) {
		return false;
	}

	for (const [shellId, done] of left) {
		const other = right.get(shellId);
		if (other?.projectId !== done.projectId || other.at !== done.at) {
			return false;
		}
	}

	return true;
}

export function snapshotsByProject({
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

function sameRecord<T>(
	before: Record<string, T>,
	after: Record<string, T>,
): boolean {
	const keys = Object.keys(before);
	if (keys.length !== Object.keys(after).length) {
		return false;
	}

	return keys.every((key) => before[key] === after[key]);
}

export function sameSnapshot(
	before: ProjectActivitySnapshot | undefined,
	after: ProjectActivitySnapshot | undefined,
): boolean {
	if (!sameRecord(before?.shells ?? {}, after?.shells ?? {})) {
		return false;
	}
	if (
		!sameRecord(before?.worktreeByShellId ?? {}, after?.worktreeByShellId ?? {})
	) {
		return false;
	}

	if (
		!sameRecord(
			before?.statusSinceByShellId ?? {},
			after?.statusSinceByShellId ?? {},
		)
	) {
		return false;
	}

	return sameRecord(
		before?.harnessByShellId ?? {},
		after?.harnessByShellId ?? {},
	);
}

export function emptySnapshot(): ProjectActivitySnapshot {
	return {
		shells: {},
		worktreeByShellId: {},
		statusSinceByShellId: {},
		harnessByShellId: {},
	};
}

export { sameDoneShells };
