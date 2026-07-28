import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type } from "arktype";
import { claudeConfigDir } from "@main/activity/claudeConfig";
import { Logger } from "@main/logger";

const TITLE_LIMIT = 120;

export const MATERIAL_MESSAGE_LIMIT = 400;
export const MATERIAL_TOTAL_LIMIT = 1600;
const MATERIAL_EDGE_COUNT = 3;

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

export function noisyText(trimmed: string): boolean {
	return NOISE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function intent(text: string, limit: number): string | null {
	const trimmed = text.trim();
	if (!trimmed || noisyText(trimmed)) {
		return null;
	}

	return trimmed.replace(/\s+/g, " ").slice(0, limit);
}

export function recordIntent(raw: string, limit = TITLE_LIMIT): string | null {
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
		return intent(record.message.content, limit);
	}

	for (const entry of record.message.content) {
		const block = textBlockSchema(entry);
		if (block instanceof type.errors) {
			continue;
		}

		const title = intent(block.text, limit);
		if (title) {
			return title;
		}
	}

	return null;
}

export function transcriptPath(ref: { sessionId: string; cwd: string }): string {
	const slug = ref.cwd.replaceAll("/", "-").replaceAll(".", "-");

	return join(claudeConfigDir(), "projects", slug, `${ref.sessionId}.jsonl`);
}

async function* transcriptIntents(ref: { sessionId: string; cwd: string }, limit: number): AsyncGenerator<string> {
	const path = transcriptPath(ref);
	const stream = createReadStream(path, { encoding: "utf8" });
	const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

	try {
		for await (const line of lines) {
			const found = recordIntent(line, limit);
			if (found) {
				yield found;
			}
		}
	} catch (err) {
		Logger.warn("claude:transcript-unreadable", { path, err: String(err) });
	} finally {
		lines.close();
		stream.destroy();
	}
}

export async function transcriptTitle(ref: { sessionId: string; cwd: string }): Promise<string | null> {
	for await (const found of transcriptIntents(ref, TITLE_LIMIT)) {
		return found;
	}

	return null;
}

function withinTotal(messages: string[]): string[] {
	const kept = [...messages];

	while (kept.join("\n").length > MATERIAL_TOTAL_LIMIT && kept.length > 1) {
		kept.splice(Math.floor(kept.length / 2), 1);
	}

	return kept;
}

export async function transcriptMaterial(ref: { sessionId: string; cwd: string }): Promise<string[]> {
	const opening: string[] = [];
	const recent: string[] = [];

	for await (const found of transcriptIntents(ref, MATERIAL_MESSAGE_LIMIT)) {
		if (opening.length < MATERIAL_EDGE_COUNT) {
			opening.push(found);
			continue;
		}

		recent.push(found);
		if (recent.length > MATERIAL_EDGE_COUNT) {
			recent.shift();
		}
	}

	return withinTotal([...opening, ...recent]);
}
