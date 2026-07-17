import { homedir } from "node:os";
import { basename, join } from "node:path";
import { type } from "arktype";
import type {
	HarnessTranscript,
	TranscriptEvent,
} from "@core/harness/Harness";
import { accepted } from "@core/harness/external";
import { indexTranscripts } from "@core/harness/transcriptFiles";

const userRecord = type({
	type: type.enumerated("user"),
	"isMeta?": "boolean",
	"message?": "unknown",
	"toolUseResult?": "unknown",
});
const completionRecord = type({
	type: type.enumerated("system"),
	subtype: type.enumerated("turn_duration", "stop_hook_summary"),
});
const toolResult = type({
	"filePath?": "string",
	"content?": "string",
	"originalFile?": "string | null",
	"oldString?": "string",
	"newString?": "string",
	"replaceAll?": "boolean",
});
const fileResult = type({ filePath: "string" });
const contentBlock = type({ type: "string", "text?": "string" });
const messageRecord = type({ content: "unknown" });

function prompt(content: unknown): string | null {
	const value = typeof content === "string"
		? content
		: Array.isArray(content)
			? content.flatMap((block) => {
				const parsed = accepted(contentBlock, block);
				return parsed?.type === "text" && parsed.text ? [parsed.text] : [];
			}).join("\n")
			: null;
	if (!value || value.includes("<local-command-stdout>") || value.startsWith("[Request interrupted")) {
		return null;
	}

	const name = /<command-name>([^<]*)<\/command-name>/.exec(value)?.[1]?.trim();
	if (!name) {
		return value;
	}

	const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(value)?.[1]?.trim();
	return `${name} ${args ?? ""}`.trim();
}

function fileChange(raw: unknown): TranscriptEvent[] | null {
	const result = accepted(toolResult, raw);
	if (!result) {
		return accepted(fileResult, raw) ? null : [];
	}
	if (!result.filePath) {
		return [];
	}
	if (result.originalFile === undefined) {
		return null;
	}

	const before = result.originalFile ?? "";
	const replacement = result.newString;
	const after = result.content ?? (
		result.oldString !== undefined && replacement !== undefined
			? result.replaceAll
				? before.replaceAll(result.oldString, () => replacement)
				: before.replace(result.oldString, () => replacement)
			: replacement
	);
	if (after === undefined) {
		return null;
	}

	return [{ type: "change", path: result.filePath, before, after }];
}

function normalizeRecord(record: unknown): TranscriptEvent[] | null {
	if (accepted(completionRecord, record)) {
		return [{ type: "complete" }];
	}

	const user = accepted(userRecord, record);
	if (!user || user.isMeta) {
		return [];
	}
	if (user.toolUseResult !== undefined) {
		return fileChange(user.toolUseResult);
	}
	if (user.message === undefined) {
		return [];
	}

	const message = accepted(messageRecord, user.message);
	const text = message ? prompt(message.content) : null;
	return text ? [{ type: "prompt", prompt: text }] : [];
}

function normalize(records: unknown[]): TranscriptEvent[] | null {
	const events: TranscriptEvent[] = [];
	for (const record of records) {
		const batch = normalizeRecord(record);
		if (batch === null) {
			return null;
		}
		events.push(...batch);
	}

	return events;
}

export const ClaudeTranscript: HarnessTranscript = {
	historicalImport: "safe",
	async locateMany(sessionIds) {
		const config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
		return await indexTranscripts(join(config, "projects"), (path) => {
			if (!path.endsWith(".jsonl")) {
				return null;
			}

			const sessionId = basename(path, ".jsonl");
			return sessionIds.has(sessionId) ? sessionId : null;
		});
	},
	normalize(records) {
		return Promise.resolve(normalize(records));
	},
};
