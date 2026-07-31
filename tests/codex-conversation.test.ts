import { describe, expect, test } from "bun:test";
import { CodexConversationParser } from "@main/activity/codexConversation";
import type { ConversationBlock } from "@shared/conversation";

function record(type: string, payload: Record<string, unknown>, timestamp = "2026-07-31T12:00:00.000Z"): string {
	return JSON.stringify({ timestamp, type, payload });
}

function parse(lines: string[]): ConversationBlock[] {
	const parser = new CodexConversationParser();

	return lines.flatMap((line) => parser.consume(line));
}

describe("what the phone reads from a Codex rollout", () => {
	test("reads the submitted prompt without repeating the user response item", () => {
		const lines = [
			record("event_msg", { type: "user_message", message: "adiciona retry" }),
			record("response_item", {
				type: "message",
				id: "user-copy",
				role: "user",
				content: [{ type: "input_text", text: "adiciona retry" }],
			}),
		];

		expect(parse(lines)).toEqual([
			{ kind: "user", id: "user-2026-07-31T12:00:00.000Z", text: "adiciona retry" },
		]);
	});

	test("reads assistant commentary and final text, but not developer messages", () => {
		const lines = [
			record("response_item", {
				type: "message",
				id: "m1",
				role: "assistant",
				phase: "commentary",
				content: [{ type: "output_text", text: "Vou conferir." }],
			}),
			record("response_item", {
				type: "message",
				id: "ignored",
				role: "developer",
				content: [{ type: "input_text", text: "regra interna" }],
			}),
			record("response_item", {
				type: "message",
				id: "m2",
				role: "assistant",
				phase: "final_answer",
				content: [{ type: "output_text", text: "Pronto." }],
			}),
		];

		expect(parse(lines)).toEqual([
			{ kind: "agent", id: "m1", text: "Vou conferir." },
			{ kind: "agent", id: "m2", text: "Pronto." },
		]);
	});

	test("settles function and custom tool calls by call id", () => {
		const lines = [
			record("response_item", { type: "function_call", call_id: "c1", name: "exec_command", arguments: "{}" }),
			record("response_item", { type: "function_call_output", call_id: "c1", output: "ok" }),
			record("response_item", { type: "custom_tool_call", call_id: "c2", name: "mcp__repo__apply_patch", input: "" }),
			record("response_item", { type: "custom_tool_call_output", call_id: "c2", output: "ok" }),
		];

		expect(parse(lines)).toEqual([
			{ kind: "tool", id: "c1", name: "exec_command", state: "running" },
			{ kind: "tool", id: "c1", name: "exec_command", state: "done" },
			{ kind: "tool", id: "c2", name: "apply_patch", state: "running" },
			{ kind: "tool", id: "c2", name: "apply_patch", state: "done" },
		]);
	});

	test("marks compaction and an aborted turn without reading unrelated records", () => {
		const lines = [
			record("event_msg", { type: "context_compacted" }),
			record("event_msg", { type: "turn_aborted", turn_id: "turn-1" }),
			record("response_item", { type: "reasoning", id: "r1", encrypted_content: "opaque", summary: [] }),
			"not json",
		];

		expect(parse(lines)).toEqual([
			{ kind: "compacted", id: "compacted-2026-07-31T12:00:00.000Z" },
			{ kind: "interrupted", id: "interrupted-turn-1" },
		]);
	});
});
