import type { ContinuityValue } from "@shared/continuity";
import type { AgentActivityState } from "@shared/activity";
import { SESSION_AUTO_ARCHIVE_MS, shellTitle } from "@shared/continuity";

export interface SessionRow {
	shellId: string;
	projectId: string;
	projectName: string;
	title: string;
	branch: string | undefined;
	harness: string | undefined;
	createdAt: number;
	lastTouchedAt: number | undefined;
	archivedAt: number | undefined;
	pinnedAt: number | undefined;
	activity: AgentActivityState | undefined;
	since: number | undefined;
}

export function sessionRows(input: {
	continuity: ContinuityValue;
	projects: { id: string; name: string }[];
	shellActivity: ReadonlyMap<string, AgentActivityState>;
	statusSince: ReadonlyMap<string, number>;
	harnesses: ReadonlyMap<string, string>;
}): SessionRow[] {
	const rows: SessionRow[] = [];

	for (const workspace of input.continuity.workspaces) {
		const project = input.projects.find((entry) => entry.id === workspace.projectId);
		if (!project) {
			continue;
		}

		for (const shell of workspace.shells) {
			const activity =
				input.shellActivity.get(shell.id) ??
				(shell.doneAt !== undefined && shell.archivedAt === undefined ? "done" : undefined);

			rows.push({
				shellId: shell.id,
				projectId: project.id,
				projectName: project.name,
				title: shellTitle(shell),
				branch: shell.branch,
				harness: input.harnesses.get(shell.id) ?? shell.session?.harness,
				createdAt: shell.createdAt,
				lastTouchedAt: shell.lastTouchedAt,
				archivedAt: shell.archivedAt,
				pinnedAt: shell.pinnedAt,
				activity,
				since: activity ? (input.statusSince.get(shell.id) ?? shell.doneAt) : undefined,
			});
		}
	}

	return rows.sort(byCreation);
}

function byCreation(left: SessionRow, right: SessionRow): number {
	return right.createdAt - left.createdAt || left.shellId.localeCompare(right.shellId);
}

function byPinned(left: SessionRow, right: SessionRow): number {
	return Number(left.pinnedAt === undefined) - Number(right.pinnedAt === undefined);
}

function byArchivedRecency(left: SessionRow, right: SessionRow): number {
	return endedAt(right) - endedAt(left) || left.shellId.localeCompare(right.shellId);
}

function endedAt(row: SessionRow): number {
	return row.archivedAt ?? row.lastTouchedAt ?? row.createdAt;
}

function archivedNow(row: SessionRow, now: number): boolean {
	if (row.archivedAt !== undefined) {
		return true;
	}

	if (row.activity || row.pinnedAt !== undefined) {
		return false;
	}

	return (row.lastTouchedAt ?? row.createdAt) < now - SESSION_AUTO_ARCHIVE_MS;
}

export function partitionSessions(
	rows: SessionRow[],
	now: number,
): { open: SessionRow[]; archived: SessionRow[] } {
	return {
		open: rows.filter((row) => !archivedNow(row, now)).sort(byPinned),
		archived: rows.filter((row) => archivedNow(row, now)).sort(byArchivedRecency),
	};
}
