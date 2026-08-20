import type { ContinuityShell } from "@shared/continuity";

export const SESSION_AUTO_ARCHIVE_MS = 3 * 24 * 60 * 60 * 1000;

export function shellTitle(shell: Pick<ContinuityShell, "label" | "title" | "branch">): string {
	return [shell.title, shell.branch].find((value) => !!value?.trim()) ?? shell.label;
}
