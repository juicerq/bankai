import { type } from "arktype";
import type { ConversationLineParser } from "@main/agents/harness/harness";
import type { ConversationBlock } from "@shared/conversation";

const CONVERSATION_LINE_LIMIT = 1024 * 1024;

const TOOL_STATES: Record<string, "running" | "done" | "failed"> = {
	pending: "running",
	running: "running",
	completed: "done",
	error: "failed",
};

const mirrorRecordSchema = type({
	id: "string",
	role: "string",
	data: { type: "string" },
});

const textPartSchema = type({ text: "string" });

const toolPartSchema = type({
	callID: "string",
	tool: "string",
	"state?": { "status?": "string" },
});

interface MirrorRecord {
	id: string;
	role: string;
	data: { type: string };
}

export class OpencodeConversationParser implements ConversationLineParser {
	readonly title = undefined;

	private readonly signatures = new Map<string, string>();

	consume(line: string): ConversationBlock[] {
		const record = this.record(line);
		if (!record) {
			return [];
		}

		const block = this.blockOf(record);
		if (!block) {
			return [];
		}

		const signature = JSON.stringify(block);
		if (this.signatures.get(block.id) === signature) {
			return [];
		}

		this.signatures.set(block.id, signature);

		return [block];
	}

	private record(line: string): MirrorRecord | undefined {
		const trimmed = line.trim();
		if (!trimmed || trimmed.length > CONVERSATION_LINE_LIMIT) {
			return undefined;
		}

		let value: unknown;
		try {
			value = JSON.parse(trimmed);
		} catch {
			return undefined;
		}

		const parsed = mirrorRecordSchema(value);
		if (parsed instanceof type.errors) {
			return undefined;
		}

		return parsed;
	}

	private blockOf(record: MirrorRecord): ConversationBlock | undefined {
		switch (record.data.type) {
			case "text":
				return this.textBlock(record);
			case "reasoning":
				return this.thinkingBlock(record);
			case "tool":
				return this.toolBlock(record);
			case "compaction":
				return { kind: "compacted", id: record.id };
			default:
				return undefined;
		}
	}

	private textBlock(record: MirrorRecord): ConversationBlock | undefined {
		const part = textPartSchema(record.data);
		if (part instanceof type.errors) {
			return undefined;
		}

		const text = part.text.trim();
		if (!text) {
			return undefined;
		}

		if (record.role === "user") {
			return { kind: "user", id: record.id, text };
		}

		return { kind: "agent", id: record.id, text };
	}

	private thinkingBlock(record: MirrorRecord): ConversationBlock | undefined {
		const part = textPartSchema(record.data);
		if (part instanceof type.errors) {
			return undefined;
		}

		const text = part.text.trim();
		if (!text) {
			return undefined;
		}

		return { kind: "thinking", id: record.id, text };
	}

	private toolBlock(record: MirrorRecord): ConversationBlock | undefined {
		const part = toolPartSchema(record.data);
		if (part instanceof type.errors) {
			return undefined;
		}

		const state = TOOL_STATES[part.state?.status ?? ""] ?? "done";

		if (part.tool === "task") {
			return { kind: "tool", id: part.callID, name: part.tool, state, agent: true };
		}

		return { kind: "tool", id: part.callID, name: part.tool, state };
	}
}
