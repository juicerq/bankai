import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type } from "arktype";
import type { AgentPresence, Harness, HarnessCommand } from "@main/agents/harness/harness";
import { ConversationParser } from "@main/agents/harness/claude/claude-conversation";
import { ClaudeConfig } from "@main/agents/harness/claude/claude-config";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";
import { SubagentTranscript } from "@main/agents/transcript/subagent-transcript";
import { CLAUDE_HARNESS_ID } from "@main/agents/harness/harness";
import { SessionRefs } from "@main/agents/session/session-refs";
import { ClaudeNamer } from "@main/agents/harness/claude/claude-namer";

const PRESENCE_STATUS: Record<string, AgentPresence["status"]> = {
	busy: "working",
	shell: "working",
	waiting: "waiting",
	idle: "idle",
};

const PUBLISHED_NAME_SOURCES = new Set(["auto", "user"]);

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
	"name?": "string",
	"nameSource?": "string",
}).pipe((raw): AgentPresence => {
	const status = presenceStatus(raw.status);
	const publishedName = PUBLISHED_NAME_SOURCES.has(raw.nameSource ?? "") ? raw.name?.trim() : undefined;

	return {
		harness: CLAUDE_HARNESS_ID,
		sessionId: raw.sessionId,
		pid: raw.pid,
		procStart: raw.procStart,
		cwd: raw.cwd,
		status,
		...(raw.statusUpdatedAt !== undefined && { statusSince: raw.statusUpdatedAt }),
		...(publishedName ? { publishedName } : {}),
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

export const ClaudeHarness: Harness = {
	id: CLAUDE_HARNESS_ID,
	label: "Claude Code",
	conversation: {
		transcript: ClaudeTranscript.locate,
		parser: () => new ConversationParser(),
		subagentTranscript: SubagentTranscript.path,
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
	proposeName: ClaudeNamer.proposeName,
	watch: () => [sessionsDirectory()],
	async discover() {
		const directory = sessionsDirectory();
		const files = await readdir(directory).catch((): string[] => []);
		const contents = await Promise.all(
			files
				.filter((file) => file.endsWith(".json"))
				.map((file) => readFile(join(directory, file), "utf8").catch(() => null)),
		);

		return contents.flatMap((raw) => {
			const record = raw === null ? null : parseSessionRecord(raw);
			if (!record) {
				return [];
			}

			return [record];
		});
	},
};
