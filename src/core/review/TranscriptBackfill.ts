import { access, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HookEvent } from "@core/hooks/HookGateway";
import { Logger } from "@core/logger";
import { ReviewModel, type Turn } from "@core/review/ReviewModel";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function normalizePrompt(text: string): string | undefined {
	if (text.includes("<local-command-stdout>") || text.startsWith("[Request interrupted")) {
		return undefined;
	}

	const name = /<command-name>([^<]*)<\/command-name>/.exec(text);
	if (!name) {
		return text;
	}

	const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text);
	return `${name[1]!.trim()} ${args?.[1]?.trim() ?? ""}`.trim();
}

// A user line is a real prompt only when it carries authored text — tool results
// and Claude Code's synthetic (isMeta) lines share the `user` type but never open a turn.
function promptFrom(line: Rec): string | undefined {
	if (line.isMeta === true) {
		return undefined;
	}

	const content = rec(line.message).content;
	if (typeof content === "string") {
		return normalizePrompt(content);
	}

	const blocks = arr(content).map(rec);
	if (blocks.some((b) => b.type === "tool_result")) {
		return undefined;
	}

	const text = blocks
		.filter((b) => b.type === "text")
		.map((b) => str(b.text) ?? "")
		.join("\n");

	return text ? normalizePrompt(text) : undefined;
}

// Map one assistant tool_use block onto the same PostToolUse shape the live hook path
// emits; ReviewModel's own guards then drop blocks without editable content (Bash, Read,
// MultiEdit). Ceiling: only content-carrying Write/Edit backfill, matching the live matcher.
function toolEdit(
	block: Rec,
): Pick<
	HookEvent,
	"filePath" | "content" | "oldString" | "newString" | "replaceAll"
> {
	const input = rec(block.input);
	return {
		filePath: str(input.file_path),
		content: str(input.content),
		oldString: str(input.old_string),
		newString: str(input.new_string),
		replaceAll: input.replace_all === true,
	};
}

function* eventsFrom(sessionId: string, content: string): Generator<HookEvent> {
	for (const raw of content.split("\n")) {
		if (!raw.trim()) {
			continue;
		}

		let line: Rec;
		try {
			line = rec(JSON.parse(raw));
		} catch {
			continue;
		}

		if (line.type === "user") {
			const prompt = promptFrom(line);
			if (prompt !== undefined) {
				yield { event: "UserPromptSubmit", sessionId, prompt };
			}
			continue;
		}

		if (line.type === "assistant") {
			for (const block of arr(rec(line.message).content).map(rec)) {
				if (block.type === "tool_use") {
					yield {
						event: "PostToolUse",
						sessionId,
						...toolEdit(block),
					};
				}
			}
		}
	}
}

export function parseTranscript(sessionId: string, content: string): Turn[] {
	const model = new ReviewModel();
	for (const event of eventsFrom(sessionId, content)) {
		model.apply(event);
	}

	return model.getTurns(sessionId);
}

function projectsDir(): string {
	return join(homedir(), ".claude", "projects");
}

// The session UUID is globally unique (D9), so scanning the project dirs finds the
// transcript without replicating the cwd-escaping rule. Walk with readdir and guard the
// id so a malformed value can't traverse out.
async function locate(sessionId: string, dir: string): Promise<string | null> {
	if (!/^[\w-]+$/.test(sessionId)) {
		return null;
	}

	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}

		const candidate = join(dir, entry.name, `${sessionId}.jsonl`);
		const found = await access(candidate).then(
			() => true,
			() => false,
		);
		if (found) {
			return candidate;
		}
	}

	return null;
}

export async function backfillTurns(
	sessionId: string,
	dir = projectsDir(),
): Promise<Turn[]> {
	const path = await locate(sessionId, dir).catch(() => null);
	if (!path) {
		return [];
	}

	// Transcripts are created lazily (D5): a located-then-vanished file is "no turns yet".
	const content = await readFile(path, "utf8").catch((err) => {
		Logger.warn("backfill:read-failed", { sessionId, err: String(err) });
		return null;
	});

	return content === null ? [] : parseTranscript(sessionId, content);
}
