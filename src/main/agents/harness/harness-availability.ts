import { execFile } from "node:child_process";
import { Logger } from "@main/infra/logger";
import { ShellCommandLine } from "@main/terminal/shell-command-line";
import { TerminalEnv } from "@main/terminal/terminal-env";
import { SHELL } from "@main/terminal/shell-binary";

const PROBE_TIMEOUT_MS = 8000;

const found = new Set<string>();

async function harnessAvailable(file: string): Promise<boolean> {
	if (found.has(file)) {
		return true;
	}

	const available = await probe(file);
	if (available) {
		found.add(file);
	}

	return available;
}

function probe(file: string): Promise<boolean> {
	return new Promise((resolve) => {
		execFile(
			SHELL,
			["-i", "-c", `command -v ${ShellCommandLine.of({ file, args: [] })}`],
			{ timeout: PROBE_TIMEOUT_MS, env: TerminalEnv.of(process.env) },
			(err) => {
				if (err) {
					Logger.info("terminal:harness-not-on-path", { file, err: err.message });
				}

				resolve(!err);
			},
		);
	});
}

export const HarnessAvailability = {
	check: harnessAvailable,
};
