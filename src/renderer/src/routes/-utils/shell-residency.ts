import type { ContinuityShell } from "@main/store/continuity";
import type { AgentActivityState } from "@shared/activity";

export const SHELL_ARCHIVE_GRACE_MS = 10 * 60 * 1000;

export type ResidencyShell = Pick<ContinuityShell, "id" | "archivedAt" | "session">;

export function shellResidency(input: {
	shells: ResidencyShell[];
	activity: ReadonlyMap<string, AgentActivityState>;
	statusSince: ReadonlyMap<string, number>;
	woken: ReadonlySet<string>;
	now: number;
}): { resident: Set<string>; resumable: Set<string> } {
	const resident = new Set<string>();
	const resumable = new Set<string>();

	for (const shell of input.shells) {
		if (shell.session) {
			resumable.add(shell.id);
		}

		if (shell.archivedAt === undefined || !shell.session || input.woken.has(shell.id)) {
			resident.add(shell.id);
			continue;
		}

		if (!input.activity.has(shell.id)) {
			continue;
		}

		const graceEndsAt = (input.statusSince.get(shell.id) ?? shell.archivedAt) + SHELL_ARCHIVE_GRACE_MS;
		if (graceEndsAt > input.now) {
			resident.add(shell.id);
		}
	}

	return { resident, resumable };
}
