import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type } from "arktype";
import { Logger } from "@main/logger";

const TITLE_LIMIT = 120;

const NOISE_PREFIXES = [
	"<local-command-caveat>",
	"<command-name>",
	"<command-message>",
	"<command-args>",
	"<local-command-stdout>",
	"<system-reminder>",
	"<task-notification>",
	"<skill",
	"Caveat:",
	"Base directory for this skill:",
	"Another Claude session sent a message:",
	"The conversation history before this point was compacted",
	"This session is being continued from a previous conversation",
	"[Request interrupted",
	"[Image #",
];

const userRecordSchema = type({
	type: "'user'",
	"isMeta?": "boolean",
	message: { content: "string | unknown[]" },
});

const textBlockSchema = type({ type: "'text'", text: "string" });

function intent(text: string): string | null {
	const trimmed = text.trim();
	if (!trimmed || NOISE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
		return null;
	}

	return trimmed.replace(/\s+/g, " ").slice(0, TITLE_LIMIT);
}

export function recordIntent(raw: string): string | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	const record = userRecordSchema(value);
	if (record instanceof type.errors || record.isMeta) {
		return null;
	}

	if (typeof record.message.content === "string") {
		return intent(record.message.content);
	}

	for (const entry of record.message.content) {
		const block = textBlockSchema(entry);
		if (block instanceof type.errors) {
			continue;
		}

		const title = intent(block.text);
		if (title) {
			return title;
		}
	}

	return null;
}

export function transcriptPath(ref: { sessionId: string; cwd: string }): string {
	const config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
	const slug = ref.cwd.replaceAll("/", "-").replaceAll(".", "-");

	return join(config, "projects", slug, `${ref.sessionId}.jsonl`);
}

export async function transcriptTitle(ref: { sessionId: string; cwd: string }): Promise<string | null> {
	const path = transcriptPath(ref);
	const stream = createReadStream(path, { encoding: "utf8" });
	const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

	try {
		for await (const line of lines) {
			const title = recordIntent(line);
			if (title) {
				return title;
			}
		}

		return null;
	} catch (err) {
		Logger.warn("claude:transcript-unreadable", { path, err: String(err) });
		return null;
	} finally {
		lines.close();
		stream.destroy();
	}
}
