import { type } from "arktype";
import type { ConversationLineParser } from "@main/agents/transcript/conversation-tail";
import type { ConversationBlock } from "@shared/conversation";

const CONVERSATION_LINE_LIMIT = 128 * 1024;

const userMessageSchema = type({
	timestamp: "string",
	type: "'event_msg'",
	payload: { type: "'user_message'", message: "string" },
});

const assistantMessageSchema = type({
	type: "'response_item'",
	payload: {
		type: "'message'",
		id: "string",
		role: "'assistant'",
		content: "unknown[]",
	},
});

const outputTextSchema = type({ type: "'output_text'", text: "string" });

const toolCallSchema = type({
	type: "'response_item'",
	payload: {
		type: "'function_call' | 'custom_tool_call'",
		call_id: "string",
		name: "string",
	},
});

const toolOutputSchema = type({
	type: "'response_item'",
	payload: {
		type: "'function_call_output' | 'custom_tool_call_output'",
		call_id: "string",
	},
});

const compactedSchema = type({
	timestamp: "string",
	type: "'event_msg'",
	payload: { type: "'context_compacted'" },
});

const abortedSchema = type({
	type: "'event_msg'",
	payload: { type: "'turn_aborted'", turn_id: "string" },
});

function conversationRecord(line: string): unknown {
	const trimmed = line.trim();
	if (!trimmed || trimmed.length > CONVERSATION_LINE_LIMIT) {
		return undefined;
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

export class CodexConversationParser implements ConversationLineParser {
	readonly title = undefined;
	private readonly toolNames = new Map<string, string>();

	consume(line: string): ConversationBlock[] {
		const value = conversationRecord(line);
		if (value === undefined) {
			return [];
		}

		const user = userMessageSchema(value);
		if (!(user instanceof type.errors)) {
			const text = user.payload.message.trim();
			if (!text) {
				return [];
			}

			return [{ kind: "user", id: `user-${user.timestamp}`, text }];
		}

		const assistant = assistantMessageSchema(value);
		if (!(assistant instanceof type.errors)) {
			const text = assistant.payload.content.flatMap((entry) => {
				const output = outputTextSchema(entry);
				if (output instanceof type.errors) {
					return [];
				}

				return [output.text];
			}).filter((part) => !!part.trim()).join("\n").trim();
			if (!text) {
				return [];
			}

			return [{ kind: "agent", id: assistant.payload.id, text }];
		}

		const call = toolCallSchema(value);
		if (!(call instanceof type.errors)) {
			const name = call.payload.name.split("__").at(-1) ?? call.payload.name;
			this.toolNames.set(call.payload.call_id, name);

			return [{ kind: "tool", id: call.payload.call_id, name, state: "running" }];
		}

		const output = toolOutputSchema(value);
		if (!(output instanceof type.errors)) {
			const name = this.toolNames.get(output.payload.call_id);
			if (!name) {
				return [];
			}

			return [{ kind: "tool", id: output.payload.call_id, name, state: "done" }];
		}

		const compacted = compactedSchema(value);
		if (!(compacted instanceof type.errors)) {
			return [{ kind: "compacted", id: `compacted-${compacted.timestamp}` }];
		}

		const aborted = abortedSchema(value);
		if (!(aborted instanceof type.errors)) {
			return [{ kind: "interrupted", id: `interrupted-${aborted.payload.turn_id}` }];
		}

		return [];
	}
}
