import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type } from "arktype";
import { ClaudeConfig } from "@main/agents/harness/claude/claude-config";
import { Logger } from "@main/infra/logger";

const TITLE_LIMIT = 120;

const PUBLISHED_TITLE_TAIL_BYTES = 128 * 1024;

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

const aiTitleSchema = type({ type: "'ai-title'", aiTitle: "string" });

const customTitleSchema = type({ type: "'custom-title'", customTitle: "string" });

function recordTitle(value: unknown): string | undefined {
	const ai = aiTitleSchema(value);
	if (!(ai instanceof type.errors)) {
		return ai.aiTitle;
	}

	const custom = customTitleSchema(value);
	if (custom instanceof type.errors) {
		return undefined;
	}

	return custom.customTitle;
}

function lineTitle(raw: string): string | undefined {
	if (!raw.includes("-title")) {
		return undefined;
	}

	try {
		return recordTitle(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

function noisyText(trimmed: string): boolean {
	return NOISE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function intent(text: string, limit: number): string | null {
	const trimmed = text.trim();
	if (!trimmed || noisyText(trimmed)) {
		return null;
	}

	return trimmed.replace(/\s+/g, " ").slice(0, limit);
}

function recordIntent(raw: string, limit = TITLE_LIMIT): string | null {
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

function transcriptPath(ref: { sessionId: string; cwd: string }): string {
	const slug = ref.cwd.replaceAll("/", "-").replaceAll(".", "-");

	return join(ClaudeConfig.dir(), "projects", slug, `${ref.sessionId}.jsonl`);
}

const locatedTranscripts = new Map<string, string>();

async function fileExists(path: string): Promise<boolean> {
	return await stat(path).then((info) => info.isFile()).catch(() => false);
}

async function locateTranscript(ref: { sessionId: string; cwd: string }): Promise<string> {
	const candidate = transcriptPath(ref);

	if (await fileExists(candidate)) {
		return candidate;
	}

	const cached = locatedTranscripts.get(ref.sessionId);

	if (cached && (await fileExists(cached))) {
		return cached;
	}

	const projects = join(ClaudeConfig.dir(), "projects");
	const folders = await readdir(projects).catch((): string[] => []);
	const matches = await Promise.all(
		folders.map(async (folder) => {
			const path = join(projects, folder, `${ref.sessionId}.jsonl`);

			if (await fileExists(path)) {
				return path;
			}

			return null;
		}),
	);
	const found = matches.find((path) => path !== null);

	if (!found) {
		return candidate;
	}

	locatedTranscripts.set(ref.sessionId, found);

	return found;
}

async function publishedTitle(path: string): Promise<string | null> {
	const handle = await open(path, "r").catch(() => null);
	if (!handle) {
		return null;
	}

	try {
		const { size } = await handle.stat();
		const length = Math.min(PUBLISHED_TITLE_TAIL_BYTES, size);
		const { buffer, bytesRead } = await handle.read({
			buffer: Buffer.alloc(length),
			position: size - length,
		});
		const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n").reverse();

		for (const line of lines) {
			const found = lineTitle(line);
			if (found) {
				return found.trim().replace(/\s+/g, " ").slice(0, TITLE_LIMIT);
			}
		}

		return null;
	} catch (err) {
		Logger.warn("claude:transcript-unreadable", { path, err: String(err) });

		return null;
	} finally {
		await handle.close();
	}
}

async function transcriptTitle(ref: { sessionId: string; cwd: string }): Promise<string | null> {
	return await publishedTitle(await locateTranscript(ref));
}

export const ClaudeTranscript = {
	noisyText,
	recordIntent,
	recordTitle,
	path: transcriptPath,
	locate: locateTranscript,
	title: transcriptTitle,
};
