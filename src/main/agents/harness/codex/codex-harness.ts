import { CodexConversationParser } from "@main/agents/harness/codex/codex-conversation";
import { codexSessionsDir } from "@main/agents/harness/codex/codex-config";
import { type CodexRolloutState, codexRollouts } from "@main/agents/harness/codex/codex-rollout";
import { codexTitle, rolloutPath } from "@main/agents/harness/codex/codex-transcript";
import type { AgentPresence, Harness, HarnessCommand } from "@main/agents/harness/harness";
import { CODEX_HARNESS_ID } from "@main/agents/harness/harness-ids";
import { procFs } from "@main/infra/proc-fs";
import { SESSION_UUID } from "@main/agents/session/session-refs";
import { codexProposeName } from "@main/agents/harness/codex/codex-namer";

const CODEX_PROCESS = "codex";

const ROLLOUT_SUFFIX = ".jsonl";

const RESUME_COMMAND = "resume";

const NON_INTERACTIVE_COMMANDS = new Set([
	"a",
	"app-server",
	"apply",
	"archive",
	"cloud",
	"completion",
	"debug",
	"delete",
	"doctor",
	"e",
	"exec",
	"exec-server",
	"features",
	"fork",
	"help",
	"login",
	"logout",
	"mcp",
	"mcp-server",
	"plugin",
	"remote-control",
	"review",
	"sandbox",
	"unarchive",
	"update",
]);

const REMOTE_FLAG = "--remote";

export function interactiveCommandLine(argv: string[] | null): boolean {
	if (!argv) {
		return false;
	}

	return !argv.slice(1).some((argument) => NON_INTERACTIVE_COMMANDS.has(argument) || argument === REMOTE_FLAG);
}

export function rolloutCandidates(openFiles: string[]): string[] {
	const sessions = `${codexSessionsDir()}/`;

	return openFiles.filter((path) => path.startsWith(sessions) && path.endsWith(ROLLOUT_SUFFIX));
}

async function rootRollout(candidates: string[]) {
	const metas = await Promise.all(
		candidates.map(async (path) => ({
			path,
			meta: await codexRollouts.meta(path),
		})),
	);
	const roots = metas.flatMap((entry) => (entry.meta?.root ? [{ path: entry.path, meta: entry.meta }] : []));
	if (roots.length !== 1) {
		return null;
	}

	return roots[0];
}

let rootRollouts: string[] = [];

interface CodexSighting {
	presence: AgentPresence;
	rollouts: string[];
	root?: string;
}

export function codexPresence(input: {
	pid: number;
	argv: string[] | null;
	procStart: string | null;
	cwd: string | null;
	session?: { sessionId: string; cwd: string; state: CodexRolloutState };
}): AgentPresence | null {
	if (!interactiveCommandLine(input.argv) || input.procStart === null || input.cwd === null) {
		return null;
	}

	const base = { harness: CODEX_HARNESS_ID, pid: input.pid, procStart: input.procStart };
	if (!input.session) {
		return { ...base, cwd: input.cwd, status: "idle" };
	}

	const { sessionId, cwd, state } = input.session;
	const since = state.turn?.startedAt ?? state.endedAt;

	return {
		...base,
		sessionId,
		cwd,
		status: state.turn ? "working" : "idle",
		...(since !== undefined && { statusSince: since }),
	};
}

async function presenceOf(pid: number): Promise<CodexSighting | null> {
	const [argv, procStart, openFiles, cwd] = await Promise.all([
		procFs.commandLine(pid),
		procFs.procStart(pid),
		procFs.openFiles(pid),
		procFs.workingDirectory(pid),
	]);
	const rollouts = rolloutCandidates(openFiles);
	const root = interactiveCommandLine(argv) ? await rootRollout(rollouts) : null;
	const session = root
		? { sessionId: root.meta.sessionId, cwd: root.meta.cwd, state: await codexRollouts.state(root.path) }
		: undefined;
	const presence = codexPresence({ pid, argv, procStart, cwd, ...(session && { session }) });
	if (!presence) {
		return null;
	}

	return { presence, rollouts, ...(root && { root: root.path }) };
}

export const CodexHarness: Harness = {
	id: CODEX_HARNESS_ID,
	label: "Codex",
	conversation: {
		transcript: ({ sessionId }) => rolloutPath(sessionId),
		parser: () => new CodexConversationParser(),
	},
	launch(): HarnessCommand {
		return { file: "codex", args: [] };
	},
	resume(ref): HarnessCommand | null {
		if (!SESSION_UUID.test(ref.sessionId)) {
			return null;
		}

		return { file: "codex", args: [RESUME_COMMAND, ref.sessionId] };
	},
	title: codexTitle,
	proposeName: codexProposeName,
	watch: () => rootRollouts,
	async discover() {
		const pids = await procFs.named(CODEX_PROCESS);
		const found = await Promise.all(pids.map((pid) => presenceOf(pid)));
		const live = found.flatMap((entry) => entry?.rollouts ?? []);
		codexRollouts.forget(new Set(live));
		rootRollouts = found.flatMap((entry) => (entry?.root ? [entry.root] : []));

		return found.flatMap((entry) => entry?.presence ?? []);
	},
};
