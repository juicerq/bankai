import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type } from "arktype";
import type { AgentPresence, Harness, HarnessCommand } from "@main/agents/harness/harness";
import { ConversationParser } from "@main/agents/harness/claude/claude-conversation";
import { ClaudeConfig } from "@main/agents/harness/claude/claude-config";
import { ClaudeSubagentTranscript } from "@main/agents/harness/claude/claude-subagent-transcript";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";
import { CLAUDE_HARNESS_ID } from "@main/agents/harness/harness";
import { SessionRefs } from "@main/agents/session/session-refs";

const PRESENCE_STATUS: Record<string, AgentPresence["status"]> = {
	busy: "working",
	shell: "working",
	waiting: "waiting",
	idle: "idle",
};

function presenceStatus(status: string | undefined): AgentPresence["status"] {
	return (status === undefined ? undefined : PRESENCE_STATUS[status]) ?? "idle";
}

const sessionRecordSchema = type({
	pid: "number",
	sessionId: "string",
	cwd: "string",
	procStart: "string",
	"status?": "string",
	"statusUpdatedAt?": "number",
}).pipe((raw): AgentPresence => {
	const status = presenceStatus(raw.status);

	return {
		harness: CLAUDE_HARNESS_ID,
		sessionId: raw.sessionId,
		pid: raw.pid,
		procStart: raw.procStart,
		cwd: raw.cwd,
		status,
		...(raw.statusUpdatedAt !== undefined && { statusSince: raw.statusUpdatedAt }),
	};
});

export function parseSessionRecord(raw: string): AgentPresence | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	const parsed = sessionRecordSchema(value);
	if (parsed instanceof type.errors) {
		return null;
	}

	return parsed;
}

function sessionsDirectory(): string {
	return join(ClaudeConfig.dir(), "sessions");
}

let transcriptFiles: string[] = [];

export const ClaudeHarness: Harness = {
	id: CLAUDE_HARNESS_ID,
	label: "Claude Code",
	conversation: {
		transcript: ClaudeTranscript.locate,
		parser: () => new ConversationParser(),
		subagentTranscript: ClaudeSubagentTranscript.path,
	},
	launch(): HarnessCommand {
		return { file: "claude", args: [] };
	},
	resume(ref): HarnessCommand | null {
		if (!SessionRefs.SESSION_UUID.test(ref.sessionId)) {
			return null;
		}

		return { file: "claude", args: ["--resume", ref.sessionId] };
	},
	title: ClaudeTranscript.title,
	watch: () => [sessionsDirectory(), ...transcriptFiles],
	async discover() {
		const directory = sessionsDirectory();
		const files = await readdir(directory).catch((): string[] => []);
		const contents = await Promise.all(
			files
				.filter((file) => file.endsWith(".json"))
				.map((file) => readFile(join(directory, file), "utf8").catch(() => null)),
		);

		const presences = contents.flatMap((raw) => {
			const record = raw === null ? null : parseSessionRecord(raw);
			if (!record) {
				return [];
			}

			return [record];
		});
		transcriptFiles = await Promise.all(
			presences.flatMap((presence) => presence.sessionId
				? [ClaudeTranscript.locate({ sessionId: presence.sessionId, cwd: presence.cwd })]
				: []),
		);

		return presences;
	},
};
