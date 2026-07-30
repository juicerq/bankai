import { codexSessionsDir } from "@main/activity/codexConfig";
import { codexLiveTrace } from "@main/activity/codexHooks";
import { codexRead } from "@main/activity/codexHookTrace";
import { codexRollouts } from "@main/activity/codexRollout";
import { codexTitle } from "@main/activity/codexTranscript";
import type { AgentPresence, Harness, HarnessCommand } from "@main/activity/Harness";
import { CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import { procFs } from "@main/activity/procFs";
import { SESSION_UUID } from "@main/activity/SessionRefs";
import { codexProposeName } from "@main/naming/codexNamer";

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

async function presenceOf(pid: number): Promise<{ presence: AgentPresence; rollouts: string[] } | null> {
	const [argv, procStart, openFiles] = await Promise.all([
		procFs.commandLine(pid),
		procFs.procStart(pid),
		procFs.openFiles(pid),
	]);
	if (!interactiveCommandLine(argv) || procStart === null) {
		return null;
	}

	const rollouts = rolloutCandidates(openFiles);
	const root = await rootRollout(rollouts);
	if (!root) {
		return null;
	}

	const state = await codexRollouts.state(root.path);
	const since = state.turn?.startedAt ?? state.endedAt;

	return {
		rollouts,
		presence: {
			harness: CODEX_HARNESS_ID,
			sessionId: root.meta.sessionId,
			pid,
			procStart,
			cwd: root.meta.cwd,
			status: state.turn ? "working" : "idle",
			...(since !== undefined && { statusSince: since }),
		},
	};
}

export const CodexHarness: Harness = {
	id: CODEX_HARNESS_ID,
	label: "Codex",
	conversation: false,
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
	read: codexRead,
	liveTrace: codexLiveTrace,
	async discover() {
		const pids = await procFs.named(CODEX_PROCESS);
		const found = await Promise.all(pids.map((pid) => presenceOf(pid)));
		const live = found.flatMap((entry) => entry?.rollouts ?? []);
		codexRollouts.forget(new Set(live));

		return found.flatMap((entry) => entry?.presence ?? []);
	},
};
