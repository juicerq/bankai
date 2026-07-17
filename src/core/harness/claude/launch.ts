import { basename } from "node:path";
import type { HarnessLaunch } from "@core/harness/Harness";

const INTERNAL_MARKERS = new Set([
	"--bg-pty-host",
	"--bg-spare",
	"daemon",
	"--fork-session",
	"bg-pty-host",
	"bg-spare",
]);

function safeArgv(argv: string[] | undefined): string[] | null {
	if (!argv) {
		return null;
	}

	const executable = argv[0];
	if (!executable || basename(executable) !== "claude") {
		return null;
	}
	if (argv.some((token) =>
		INTERNAL_MARKERS.has(token)
		|| token.startsWith("--bg-")
		|| token.includes(".sock"))) {
		return null;
	}

	const resume = argv.indexOf("--resume");
	if (resume >= 0 && argv[resume + 1]?.endsWith(".jsonl")) {
		return null;
	}

	return argv;
}

function withoutSession(argv: string[]): string[] {
	const result: string[] = [];
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index];
		if (!token || token === "--continue" || token.startsWith("--continue=")) {
			continue;
		}
		if (token === "--resume" || token === "--session-id") {
			index++;
			continue;
		}
		if (!token.startsWith("--resume=") && !token.startsWith("--session-id=")) {
			result.push(token);
		}
	}

	return result;
}

export const ClaudeLaunch: HarnessLaunch = {
	resume: (sessionId, argv) => [
		...withoutSession(safeArgv(argv) ?? ["claude"]),
		"--resume",
		sessionId,
	],
	fresh: (argv) => {
		if (!argv) {
			return ["claude"];
		}

		const safe = safeArgv(argv);
		return safe ? withoutSession(safe) : null;
	},
};
