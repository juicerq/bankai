import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { codexSessionsDir } from "@main/agents/harness/codex/codex-config";
import { MATERIAL_EDGE_COUNT, MATERIAL_MESSAGE_LIMIT, withinTotal } from "@main/agents/transcript/transcript-material";
import { Logger } from "@main/infra/logger";
import { type } from "arktype";

const TITLE_LIMIT = 120;

const ROLLOUT_SUFFIX = ".jsonl";

const userMessageSchema = type({
	type: "'event_msg'",
	payload: {
		type: "'user_message'",
		message: "string",
	},
}).pipe((raw) => raw.payload.message);

export function messageIntent(raw: string, limit = TITLE_LIMIT): string | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	const message = userMessageSchema(value);
	if (message instanceof type.errors) {
		return null;
	}

	const trimmed = message.trim();
	if (!trimmed || trimmed.startsWith("<")) {
		return null;
	}

	return trimmed.replace(/\s+/g, " ").slice(0, limit);
}

export async function rolloutPath(sessionId: string): Promise<string | null> {
	const root = codexSessionsDir();
	const entries = await readdir(root, { recursive: true }).catch((err: unknown) => {
		Logger.info("codex:sessions-unreadable", { root, err: String(err) });

		return null;
	});
	if (!entries) {
		return null;
	}

	const found = entries.find((entry) => entry.endsWith(`${sessionId}${ROLLOUT_SUFFIX}`));
	if (!found) {
		return null;
	}

	return join(root, found);
}

async function* rolloutIntents(sessionId: string, limit: number): AsyncGenerator<string> {
	const path = await rolloutPath(sessionId);
	if (!path) {
		return;
	}

	const stream = createReadStream(path, { encoding: "utf8" });
	const lines = createInterface({
		input: stream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	try {
		for await (const line of lines) {
			const found = messageIntent(line, limit);
			if (found) {
				yield found;
			}
		}
	} catch (err) {
		Logger.warn("codex:rollout-unreadable", { path, err: String(err) });
	} finally {
		lines.close();
		stream.destroy();
	}
}

export async function codexTitle(ref: { sessionId: string }): Promise<string | null> {
	for await (const found of rolloutIntents(ref.sessionId, TITLE_LIMIT)) {
		return found;
	}

	return null;
}

export async function codexMaterial(ref: { sessionId: string }): Promise<string[]> {
	const opening: string[] = [];
	const recent: string[] = [];

	for await (const found of rolloutIntents(ref.sessionId, MATERIAL_MESSAGE_LIMIT)) {
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
