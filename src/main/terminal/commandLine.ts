import type { HarnessCommand } from "@main/activity/Harness";

const BARE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

function quote(word: string): string {
	if (BARE_WORD.test(word)) {
		return word;
	}

	return `'${word.replaceAll("'", "'\\''")}'`;
}

export function shellCommandLine(command: HarnessCommand): string {
	return [command.file, ...command.args].map(quote).join(" ");
}

export function shellArgs(shell: string, launch?: string): string[] {
	if (!launch) {
		return [];
	}

	return ["-i", "-c", `${launch}; exec ${quote(shell)}`];
}
