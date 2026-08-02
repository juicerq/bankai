import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type } from "arktype";
import type { AgentPresence, Harness, HarnessCommand } from "@main/activity/Harness";
import { ConversationParser } from "@main/activity/claude/claudeConversation";
import { claudeConfigDir } from "@main/activity/claude/claudeConfig";
import { locateTranscript, transcriptTitle } from "@main/activity/claude/claudeTranscript";
import { subagentTranscriptPath } from "@main/activity/claude/subagentTranscript";
import { CLAUDE_HARNESS_ID } from "@main/activity/harnessIds";
import { SESSION_UUID } from "@main/activity/SessionRefs";
import { claudeProposeName } from "@main/naming/claudeNamer";

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
	return join(claudeConfigDir(), "sessions");
}

export const ClaudeHarness: Harness = {
	id: CLAUDE_HARNESS_ID,
	label: "Claude Code",
	conversation: {
		transcript: locateTranscript,
		parser: () => new ConversationParser(),
		subagentTranscript: subagentTranscriptPath,
	},
	launch(): HarnessCommand {
		return { file: "claude", args: [] };
	},
	resume(ref): HarnessCommand | null {
		if (!SESSION_UUID.test(ref.sessionId)) {
			return null;
		}

		return { file: "claude", args: ["--resume", ref.sessionId] };
	},
	title: transcriptTitle,
	proposeName: claudeProposeName,
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
