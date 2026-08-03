import type { HarnessCommand } from "@main/agents/harness/harness";

const BARE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

function quote(word: string): string {
	if (BARE_WORD.test(word)) {
		return word;
	}

	return `'${word.replaceAll("'", "'\\''")}'`;
}

function shellCommandLine(command: HarnessCommand): string {
	return [command.file, ...command.args].map(quote).join(" ");
}

const ARGUMENT = /(?:[^\s'"]+|'[^']*'|"[^"]*")+/g;
const QUOTED_RUN = /'([^']*)'|"([^"]*)"/g;

function splitArguments(raw: string): string[] {
	return (raw.match(ARGUMENT) ?? []).map((argument) =>
		argument.replaceAll(QUOTED_RUN, (_, single: string | undefined, double: string) => single ?? double)
	);
}

function shellArgs(shell: string, launch?: string): string[] {
	if (!launch) {
		return [];
	}

	return ["-i", "-c", `${process.platform === "linux" ? "setsid " : ""}${launch}; exec ${quote(shell)}`];
}

function serviceArgs(launch: string): string[] {
	return ["-l", "-c", launch];
}

export const ShellCommandLine = {
	of: shellCommandLine,
	split: splitArguments,
	shellArgs,
	serviceArgs,
};
