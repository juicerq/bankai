import type { HarnessLaunch } from "@core/harness/Harness";
import { interactiveCodexCommand } from "@core/harness/codex/command";

const VALUE_OPTIONS = new Set([
	"--model",
	"-m",
	"--sandbox",
	"-s",
	"--ask-for-approval",
	"-a",
	"--cd",
	"-C",
	"--add-dir",
	"--config",
	"-c",
	"--profile",
	"-p",
	"--local-provider",
]);
const FLAG_OPTIONS = new Set([
	"--search",
	"--no-alt-screen",
	"--oss",
	"--dangerously-bypass-approvals-and-sandbox",
]);

function safeLaunch(argv: string[] | undefined): string[] | null {
	if (!argv || !interactiveCodexCommand(argv)) {
		return null;
	}

	const safe = [argv[0]!];
	for (let index = 1; index < argv.length; index++) {
		const token = argv[index]!;
		if (token === "resume") {
			break;
		}

		const equals = token.indexOf("=");
		const assignedOption = equals > 0 ? token.slice(0, equals) : null;
		if (
			FLAG_OPTIONS.has(token)
			|| (assignedOption !== null && VALUE_OPTIONS.has(assignedOption))
		) {
			safe.push(token);
			continue;
		}
		if (!VALUE_OPTIONS.has(token)) {
			return null;
		}

		const value = argv[++index];
		if (!value) {
			return null;
		}
		safe.push(token, value);
	}

	return safe;
}

export const CodexLaunch: HarnessLaunch = {
	resume: (sessionId, argv) => [
		...(safeLaunch(argv) ?? ["codex"]),
		"resume",
		sessionId,
	],
	fresh: (argv) => argv ? safeLaunch(argv) : ["codex"],
};
