import { execFile } from "node:child_process";
import { Logger } from "@main/logger";
import { shellCommandLine } from "@main/terminal/commandLine";
import { terminalEnv } from "@main/terminal/env";
import { SHELL } from "@main/terminal/shell";

const PROBE_TIMEOUT_MS = 8000;

const found = new Set<string>();

export async function harnessAvailable(file: string): Promise<boolean> {
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
			["-i", "-c", `command -v ${shellCommandLine({ file, args: [] })}`],
			{ timeout: PROBE_TIMEOUT_MS, env: terminalEnv(process.env) },
			(err) => {
				if (err) {
					Logger.info("terminal:harness-not-on-path", { file, err: err.message });
				}

				resolve(!err);
			},
		);
	});
}
