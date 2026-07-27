import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type } from "arktype";
import type { AgentPresence, Harness, HarnessCommand } from "@main/activity/Harness";
import { transcriptTrace } from "@main/activity/claudeTrace";
import { transcriptTitle } from "@main/activity/claudeTranscript";

const CLAUDE_HARNESS_ID = "claude";

const CLAUDE_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRESENCE_STATUS: Record<string, AgentPresence["status"]> = {
	busy: "working",
	shell: "working",
	waiting: "waiting",
	idle: "idle",
};

const WAITING_TRACE: Record<string, string> = {
	"permission prompt": "Needs permission",
	"sandbox request": "Needs permission",
	"input needed": "Needs input",
	"worker request": "Needs input",
	"dialog open": "Waiting on you",
};

export const WAITING_TRACE_FALLBACK = "Waiting on you";

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
	"waitingFor?": "string",
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
		...(status === "waiting" && { waitingFor: WAITING_TRACE[raw.waitingFor ?? ""] ?? WAITING_TRACE_FALLBACK }),
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
	const config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
	return join(config, "sessions");
}

export const ClaudeHarness: Harness = {
	id: CLAUDE_HARNESS_ID,
	label: "Claude Code",
	launch(): HarnessCommand {
		return { file: "claude", args: [] };
	},
	resume(ref): HarnessCommand | null {
		if (!CLAUDE_SESSION_ID.test(ref.sessionId)) {
			return null;
		}

		return { file: "claude", args: ["--resume", ref.sessionId] };
	},
	title: transcriptTitle,
	trace: transcriptTrace,
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
