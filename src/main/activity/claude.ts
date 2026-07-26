import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type } from "arktype";
import type { AgentPresence, Harness, ResumeCommand } from "@main/activity/Harness";
import { transcriptTrace } from "@main/activity/claudeTrace";
import { transcriptTitle } from "@main/activity/claudeTranscript";

const CLAUDE_HARNESS_ID = "claude";

const CLAUDE_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function presenceStatus(status: string | undefined): AgentPresence["status"] {
	if (status === "busy") {
		return "working";
	}
	if (status === "waiting") {
		return "waiting";
	}

	return "idle";
}

const sessionRecordSchema = type({
	pid: "number",
	sessionId: "string",
	cwd: "string",
	procStart: "string",
	"status?": "string",
}).pipe((raw): AgentPresence => ({
	harness: CLAUDE_HARNESS_ID,
	sessionId: raw.sessionId,
	pid: raw.pid,
	procStart: raw.procStart,
	cwd: raw.cwd,
	status: presenceStatus(raw.status),
}));

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
	resume(ref): ResumeCommand | null {
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
