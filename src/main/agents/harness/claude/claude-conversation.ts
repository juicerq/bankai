import { type } from "arktype";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";
import type { ConversationBlock, ConversationEdit } from "@shared/conversation";

export const CONVERSATION_LINE_LIMIT = 128 * 1024;

export const AGENT_TOOL_NAMES = new Set(["agent", "task"]);

const IMAGE_PLACEHOLDER = "[image]";
const INTERRUPTION_PREFIX = "[Request interrupted";

const BASE64_PAYLOAD = /"data":"[A-Za-z0-9+/=]{256,}"/g;

const userRecordSchema = type({
	type: "'user'",
	"uuid?": "string",
	"isMeta?": "boolean",
	"isCompactSummary?": "boolean",
	"toolUseResult?": "unknown",
	message: { content: "string | unknown[]" },
});

const assistantRecordSchema = type({
	type: "'assistant'",
	"uuid?": "string",
	message: { "id?": "string", content: "unknown[]" },
});

const compactBoundarySchema = type({ type: "'system'", subtype: "'compact_boundary'", "uuid?": "string" });

const textBlockSchema = type({ type: "'text'", text: "string" });

const thinkingBlockSchema = type({ type: "'thinking'", thinking: "string" });

const editResultSchema = type({
	filePath: "string",
	"structuredPatch?": type({ lines: "string[]" }).array(),
	"content?": "string",
});

function editOf(value: unknown): ConversationEdit | undefined {
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

const imageBlockSchema = type({ type: "'image'" });

const toolUseBlockSchema = type({
	type: "'tool_use'",
	id: "string",
	name: "string",
	"input?": "Record<string, unknown>",
});

const toolResultBlockSchema = type({
	type: "'tool_result'",
	tool_use_id: "string",
	"is_error?": "boolean",
});

function conversationRecord(line: string): unknown {
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

export class ConversationParser {
	title: string | undefined;
	private sequence = 0;
	private readonly agentText = new Map<string, string>();
	private readonly thoughts = new Map<string, string>();
	private readonly toolNames = new Map<string, string>();
	private readonly agentTools = new Set<string>();

	consume(line: string): ConversationBlock[] {
		this.sequence += 1;

		const value = conversationRecord(line);
		if (value === undefined) {
			return [];
		}

		const title = ClaudeTranscript.recordTitle(value);
		if (title) {
			this.title = title;

			return [];
		}

		const compacted = compactBoundarySchema(value);
		if (!(compacted instanceof type.errors)) {
			return [{ kind: "compacted", id: this.blockId(compacted.uuid) }];
		}

		const assistant = assistantRecordSchema(value);
		if (!(assistant instanceof type.errors)) {
			return this.fromAssistant(assistant);
		}

		const user = userRecordSchema(value);
		if (!(user instanceof type.errors)) {
			return this.fromUser(user);
		}

		return [];
	}

	private blockId(uuid: string | undefined): string {
		return uuid ?? `line-${this.sequence}`;
	}

	private fromAssistant(record: typeof assistantRecordSchema.infer): ConversationBlock[] {
		const blocks: ConversationBlock[] = [];

		for (const entry of record.message.content) {
			const tool = toolUseBlockSchema(entry);
			if (!(tool instanceof type.errors)) {
				const name = tool.name.split("__").at(-1) ?? tool.name;
				this.toolNames.set(tool.id, name);

				if (AGENT_TOOL_NAMES.has(tool.name.toLowerCase())) {
					this.agentTools.add(tool.id);
					blocks.push({ kind: "tool", id: tool.id, name, state: "running", agent: true });

					continue;
				}

				blocks.push({ kind: "tool", id: tool.id, name, state: "running" });

				continue;
			}

			const thought = thinkingBlockSchema(entry);
			if (!(thought instanceof type.errors)) {
				const id = `thinking-${record.message.id ?? this.blockId(record.uuid)}`;
				const thinking = [this.thoughts.get(id), thought.thinking].filter((part) => !!part?.trim()).join("\n");
				this.thoughts.set(id, thinking);

				if (thinking.trim()) {
					blocks.push({ kind: "thinking", id, text: thinking.trim() });
				}

				continue;
			}

			const text = textBlockSchema(entry);
			if (text instanceof type.errors) {
				continue;
			}

			const id = record.message.id ?? this.blockId(record.uuid);
			const grown = [this.agentText.get(id), text.text].filter((part) => !!part?.trim()).join("\n");
			this.agentText.set(id, grown);

			if (grown.trim()) {
				blocks.push({ kind: "agent", id, text: grown.trim() });
			}
		}

		return blocks;
	}

	private fromUser(record: typeof userRecordSchema.infer): ConversationBlock[] {
		const id = this.blockId(record.uuid);

		if (record.isCompactSummary) {
			return [{ kind: "compacted", id }];
		}

		if (typeof record.message.content === "string") {
			return this.spoken(id, [record.message.content], record.isMeta);
		}

		const settled: ConversationBlock[] = [];
		const texts: string[] = [];
		const edit = editOf(record.toolUseResult);

		for (const entry of record.message.content) {
			const result = toolResultBlockSchema(entry);
			if (!(result instanceof type.errors)) {
				const updated = this.settleTool(result, edit);
				if (updated) {
					settled.push(updated);
				}

				continue;
			}

			const text = textBlockSchema(entry);
			if (!(text instanceof type.errors)) {
				texts.push(text.text);

				continue;
			}

			if (!(imageBlockSchema(entry) instanceof type.errors)) {
				texts.push(IMAGE_PLACEHOLDER);
			}
		}

		return [...settled, ...this.spoken(id, texts, record.isMeta)];
	}

	private spoken(id: string, texts: string[], isMeta: boolean | undefined): ConversationBlock[] {
		if (texts.some((text) => text.trimStart().startsWith(INTERRUPTION_PREFIX))) {
			return [{ kind: "interrupted", id }];
		}

		if (isMeta) {
			return [];
		}

		const said = texts.filter((text) => !ClaudeTranscript.noisyText(text.trim())).join("\n").trim();
		if (!said) {
			return [];
		}

		return [{ kind: "user", id, text: said }];
	}

	private settleTool(
		result: typeof toolResultBlockSchema.infer,
		edit: ConversationEdit | undefined,
	): ConversationBlock | undefined {
		const name = this.toolNames.get(result.tool_use_id);
		if (name === undefined) {
			return undefined;
		}

		const settled = {
			kind: "tool",
			id: result.tool_use_id,
			name,
			state: result.is_error ? "failed" : "done",
			...(this.agentTools.has(result.tool_use_id) ? { agent: true } : {}),
		} satisfies ConversationBlock;

		if (!edit) {
			return settled;
		}

		return { ...settled, edit };
	}
}
