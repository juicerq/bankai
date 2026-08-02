import { type } from "arktype";
import type { ConversationEdit } from "@shared/conversation";
import { CONVERSATION_LINE_LIMIT } from "@shared/conversation";

const BASE64_PAYLOAD = /"data":"[A-Za-z0-9+/=]{256,}"/g;

export const userRecordSchema = type({
	type: "'user'",
	"uuid?": "string",
	"isMeta?": "boolean",
	"isCompactSummary?": "boolean",
	"toolUseResult?": "unknown",
	message: { content: "string | unknown[]" },
});

export const assistantRecordSchema = type({
	type: "'assistant'",
	"uuid?": "string",
	message: { "id?": "string", content: "unknown[]" },
});

export const compactBoundarySchema = type({ type: "'system'", subtype: "'compact_boundary'", "uuid?": "string" });

const aiTitleSchema = type({ type: "'ai-title'", aiTitle: "string" });

const customTitleSchema = type({ type: "'custom-title'", customTitle: "string" });

export const textBlockSchema = type({ type: "'text'", text: "string" });

export const thinkingBlockSchema = type({ type: "'thinking'", thinking: "string" });

const editResultSchema = type({
	filePath: "string",
	"structuredPatch?": type({ lines: "string[]" }).array(),
	"content?": "string",
});

export const imageBlockSchema = type({ type: "'image'" });

export const toolUseBlockSchema = type({
	type: "'tool_use'",
	id: "string",
	name: "string",
	"input?": "Record<string, unknown>",
});

export const toolResultBlockSchema = type({
	type: "'tool_result'",
	tool_use_id: "string",
	"is_error?": "boolean",
});

export function conversationRecord(line: string): unknown {
	const trimmed = line.trim();
	if (!trimmed) {
		return undefined;
	}

	const lightened = trimmed.length > CONVERSATION_LINE_LIMIT
		? trimmed.replace(BASE64_PAYLOAD, '"data":""')
		: trimmed;
	if (lightened.length > CONVERSATION_LINE_LIMIT) {
		return undefined;
	}

	try {
		return JSON.parse(lightened);
	} catch {
		return undefined;
	}
}

export function recordTitle(value: unknown): string | undefined {
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

export function editOf(value: unknown): ConversationEdit | undefined {
	const result = editResultSchema(value);
	if (result instanceof type.errors) {
		return undefined;
	}

	let added = 0;
	let removed = 0;

	for (const hunk of result.structuredPatch ?? []) {
		for (const line of hunk.lines) {
			if (line.startsWith("+")) {
				added += 1;
			}

			if (line.startsWith("-")) {
				removed += 1;
			}
		}
	}

	const written = result.content?.trimEnd();
	if (added === 0 && removed === 0 && written) {
		return { added: written.split("\n").length, removed: 0 };
	}

	return { added, removed };
}
