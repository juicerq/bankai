import { OpencodeConfig } from "@main/agents/harness/opencode/opencode-config";
import { OpencodeConversationParser } from "@main/agents/harness/opencode/opencode-conversation";
import { type OpencodeSessionState, OpencodeDb } from "@main/agents/harness/opencode/opencode-db";
import { OpencodeTranscript } from "@main/agents/harness/opencode/opencode-transcript";
import { OPENCODE_HARNESS_ID } from "@main/agents/harness/harness";
import type { AgentPresence, Harness, HarnessCommand } from "@main/agents/harness/harness";
import { ProcFs } from "@main/infra/proc-fs";

const OPENCODE_PROCESS = "opencode";

const SESSION_ID_PATTERN = /^ses_[0-9a-z]+$/i;

const SESSION_COMMAND_FLAGS = new Set(["--session", "-s"]);

const HEADLESS_COMMANDS = new Set([
	"acp",
	"agent",
	"attach",
	"auth",
	"completion",
	"db",
	"debug",
	"export",
	"github",
	"help",
	"import",
	"mcp",
	"models",
	"plugin",
	"pr",
	"providers",
	"run",
	"serve",
	"session",
	"stats",
	"uninstall",
	"upgrade",
	"web",
]);

interface OpencodeInvocation {
	interactive: boolean;
	sessionId?: string;
}

export function interactiveInvocation(argv: string[] | null): OpencodeInvocation {
	if (!argv || argv[0] !== OPENCODE_PROCESS) {
		return { interactive: false };
	}

	const parsed: OpencodeInvocation = { interactive: true };
	const args = argv.slice(1);
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === undefined) {
			break;
		}

		if (SESSION_COMMAND_FLAGS.has(argument)) {
			index += 1;
			const value = args[index];
			if (value !== undefined) {
				parsed.sessionId = value;
			}

			continue;
		}

		if (argument.startsWith("--session=")) {
			parsed.sessionId = argument.slice("--session=".length);

			continue;
		}

		if (argument.startsWith("-s") && argument.length > 2) {
			parsed.sessionId = argument.slice(2);

			continue;
		}

		if (!argument.startsWith("-") && HEADLESS_COMMANDS.has(argument)) {
			return { interactive: false };
		}
	}

	return parsed;
}

function presenceStatus(turn: { open: boolean }, questionSince: number | undefined): AgentPresence["status"] {
	if (!turn.open) {
		return "idle";
	}

	if (questionSince !== undefined) {
		return "waiting";
	}

	return "working";
}

function presenceSince(input: {
	turn: { open: boolean; startedAt?: number; endedAt?: number };
	questionSince?: number;
}): number | undefined {
	if (!input.turn.open) {
		return input.turn.endedAt;
	}

	return input.questionSince ?? input.turn.startedAt;
}

export function opencodePresence(input: {
	pid: number;
	argv: string[] | null;
	procStart: string | null;
	cwd: string | null;
	session?: OpencodeSessionState;
}): AgentPresence | null {
	if (!interactiveInvocation(input.argv).interactive || input.procStart === null || input.cwd === null) {
		return null;
	}

	const base = { harness: OPENCODE_HARNESS_ID, pid: input.pid, procStart: input.procStart };
	if (!input.session) {
		return { ...base, cwd: input.cwd, status: "idle" };
	}

	const since = presenceSince(input.session);

	return {
		...base,
		sessionId: input.session.sessionId,
		cwd: input.session.cwd,
		status: presenceStatus(input.session.turn, input.session.questionSince),
		...(since !== undefined && { statusSince: since }),
	};
}

function boundSession(sessionId: string | undefined, cwd: string): OpencodeSessionState | undefined {
	if (sessionId === undefined) {
		const found = OpencodeDb.latestRootSession(cwd);
		if (!found) {
			return undefined;
		}

		const state = OpencodeDb.state(found.sessionId);
		if (!state) {
			return undefined;
		}

		return { ...found, ...state };
	}

	const state = OpencodeDb.state(sessionId);
	if (!state) {
		return undefined;
	}

	return { sessionId, ...state };
}

async function presenceOf(pid: number): Promise<AgentPresence | null> {
	const [argv, procStart, cwd] = await Promise.all([
		ProcFs.commandLine(pid),
		ProcFs.procStart(pid),
		ProcFs.workingDirectory(pid),
	]);
	const command = interactiveInvocation(argv);
	if (!command.interactive || procStart === null || cwd === null) {
		return null;
	}

	const session = boundSession(command.sessionId, cwd);

	return opencodePresence({ pid, argv, procStart, cwd, ...(session && { session }) });
}

export const OpencodeHarness: Harness = {
	id: OPENCODE_HARNESS_ID,
	label: "OpenCode",
	conversation: {
		transcript: OpencodeTranscript.locate,
		parser: () => new OpencodeConversationParser(),
		subagentTranscript: OpencodeTranscript.subagentTranscript,
	},
	launch(): HarnessCommand {
		return { file: "opencode", args: [] };
	},
	resume(ref): HarnessCommand | null {
		if (!SESSION_ID_PATTERN.test(ref.sessionId)) {
			return null;
		}

		return { file: "opencode", args: ["--session", ref.sessionId] };
	},
	title: async ({ sessionId }) => OpencodeDb.title(sessionId),
	watch: () => [OpencodeConfig.dbPath(), `${OpencodeConfig.dbPath()}-wal`],
	async discover() {
		OpencodeTranscript.pumpKnown();
		const pids = await ProcFs.named(OPENCODE_PROCESS);

		return (await Promise.all(pids.map((pid) => presenceOf(pid)))).flatMap((presence) => presence ?? []);
	},
};
