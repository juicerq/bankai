import type { ContinuityValue } from "@main/store/continuity";
import type { AgentActivityState, ShellAttention } from "@shared/activity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";

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
	activity: AgentActivityState | undefined;
	trace: string | undefined;
	traceSince: number | undefined;
	attention: ShellAttention | undefined;
}

export function sessionTrace(
	activity: AgentActivityState | undefined,
	observed?: string,
): string | undefined {
	if (!activity) {
		return undefined;
	}
	if (activity === "done-unseen") {
		return "Done";
	}
	if (activity === "working") {
		return observed ?? "Working";
	}

	return observed;
}

export function sessionSince(input: {
	activity: AgentActivityState | undefined;
	traceSince: number | undefined;
	statusSince: number | undefined;
}): number | undefined {
	if (!input.activity) {
		return undefined;
	}
	if (input.activity === "done-unseen") {
		return input.statusSince;
	}

	return input.traceSince ?? input.statusSince;
}

export function sessionRows(input: {
	continuity: ContinuityValue;
	projects: { id: string; name: string }[];
	shellActivity: ReadonlyMap<string, AgentActivityState>;
	traces: ReadonlyMap<string, string>;
	traceSince: ReadonlyMap<string, number>;
	statusSince: ReadonlyMap<string, number>;
	attention: ReadonlyMap<string, ShellAttention>;
}): SessionRow[] {
	const rows: SessionRow[] = [];

	for (const workspace of input.continuity.workspaces) {
		const project = input.projects.find((entry) => entry.id === workspace.projectId);
		if (!project) {
			continue;
		}

		for (const shell of workspace.shells) {
			const activity = input.shellActivity.get(shell.id);

			rows.push({
				shellId: shell.id,
				projectId: project.id,
				projectName: project.name,
				title: [shell.title, shell.branch].find((value) => !!value?.trim()) ?? shell.label,
				branch: shell.branch,
				harness: shell.session?.harness,
				createdAt: shell.createdAt,
				lastTouchedAt: shell.lastTouchedAt,
				archivedAt: shell.archivedAt,
				activity,
				trace: sessionTrace(activity, input.traces.get(shell.id)),
				traceSince: sessionSince({
					activity,
					traceSince: input.traceSince.get(shell.id),
					statusSince: input.statusSince.get(shell.id),
				}),
				attention: input.attention.get(shell.id),
			});
		}
	}

	return rows.sort(byCreation);
}

function byCreation(left: SessionRow, right: SessionRow): number {
	return right.createdAt - left.createdAt || left.shellId.localeCompare(right.shellId);
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

	if (row.activity) {
		return false;
	}

	return (row.lastTouchedAt ?? row.createdAt) < now - SESSION_AUTO_ARCHIVE_MS;
}

export function partitionSessions(
	rows: SessionRow[],
	now: number,
): { open: SessionRow[]; archived: SessionRow[] } {
	return {
		open: rows.filter((row) => !archivedNow(row, now)),
		archived: rows.filter((row) => archivedNow(row, now)).sort(byArchivedRecency),
	};
}
