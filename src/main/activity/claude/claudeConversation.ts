import { type } from "arktype";
import { noisyText } from "@main/activity/claude/claudeTranscript";
import {
	assistantRecordSchema,
	compactBoundarySchema,
	conversationRecord,
	editOf,
	imageBlockSchema,
	recordTitle,
	textBlockSchema,
	thinkingBlockSchema,
	toolResultBlockSchema,
	toolUseBlockSchema,
	userRecordSchema,
} from "@main/activity/claude/conversationRecords";
import type { ConversationBlock, ConversationEdit } from "@shared/conversation";

export const AGENT_TOOL_NAMES = new Set(["agent", "task"]);

const IMAGE_PLACEHOLDER = "[image]";
const INTERRUPTION_PREFIX = "[Request interrupted";

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

		const title = recordTitle(value);
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

		const said = texts.filter((text) => !noisyText(text.trim())).join("\n").trim();
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
