import { describe, expect, it } from "bun:test";
import { CONVERSATION_LINE_LIMIT } from "@shared/conversation";
import { ConversationParser } from "@main/activity/claude/claudeConversation";
import type { ConversationBlock } from "@shared/conversation";

function userRecord(content: unknown, extra: Record<string, unknown> = {}): string {
	return JSON.stringify({ type: "user", uuid: "u1", message: { content }, ...extra });
}

function assistantRecord(messageId: string, content: unknown[], uuid = "a1"): string {
	return JSON.stringify({ type: "assistant", uuid, message: { id: messageId, content } });
}

function parse(lines: string[]): { blocks: ConversationBlock[]; title: string | undefined } {
	const parser = new ConversationParser();
	const blocks = lines.flatMap((line) => parser.consume(line));

	return { blocks, title: parser.title };
}

describe("what the phone reads out of a user record", () => {
	it("takes a plain message as the prompt the user typed", () => {
		expect(parse([userRecord("adiciona retry no upload")]).blocks).toEqual([
			{ kind: "user", id: "u1", text: "adiciona retry no upload" },
		]);
	});

	it("joins the text blocks of a block list and keeps the line breaks", () => {
		expect(
			parse([userRecord([{ type: "text", text: "primeiro isso" }, { type: "text", text: "depois aquilo" }])]).blocks,
		).toEqual([{ kind: "user", id: "u1", text: "primeiro isso\ndepois aquilo" }]);
	});

	it("stands an image in for its payload instead of carrying it", () => {
		const content = [
			{ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo" } },
			{ type: "text", text: "olha esse erro" },
		];

		expect(parse([userRecord(content)]).blocks).toEqual([
			{ kind: "user", id: "u1", text: "[image]\nolha esse erro" },
		]);
	});

	it("drops the noise blocks and keeps what the human wrote beside them", () => {
		const content = [
			{ type: "text", text: "roda os testes" },
			{ type: "text", text: "<system-reminder>remember the rules</system-reminder>" },
		];

		expect(parse([userRecord(content)]).blocks).toEqual([{ kind: "user", id: "u1", text: "roda os testes" }]);
	});

	it("says nothing when the record is meta or pure noise", () => {
		expect(parse([userRecord("qualquer coisa", { isMeta: true })]).blocks).toEqual([]);
		expect(parse([userRecord("<command-name>/review</command-name>")]).blocks).toEqual([]);
	});

	it("marks an interruption instead of printing its sentence", () => {
		expect(parse([userRecord("[Request interrupted by user]")]).blocks).toEqual([
			{ kind: "interrupted", id: "u1" },
		]);
	});

	it("marks a continuation summary as a compaction", () => {
		expect(parse([userRecord("This session is being continued", { isCompactSummary: true })]).blocks).toEqual([
			{ kind: "compacted", id: "u1" },
		]);
	});
});

describe("what the phone reads out of an assistant record", () => {
	it("grows one message from the chunks that share its id", () => {
		const blocks = parse([
			assistantRecord("msg_1", [{ type: "text", text: "Vou olhar o upload." }], "a1"),
			assistantRecord("msg_1", [{ type: "text", text: "Sem retry nenhum." }], "a2"),
		]).blocks;

		expect(blocks).toEqual([
			{ kind: "agent", id: "msg_1", text: "Vou olhar o upload." },
			{ kind: "agent", id: "msg_1", text: "Vou olhar o upload.\nSem retry nenhum." },
		]);
	});

	it("keeps the reasoning as its own block, apart from what the agent said", () => {
		const blocks = parse([
			assistantRecord("msg_1", [
				{ type: "thinking", thinking: "o upload não tem retry", signature: "sig" },
				{ type: "text", text: "Vou olhar o upload." },
			]),
		]).blocks;

		expect(blocks).toEqual([
			{ kind: "thinking", id: "thinking-msg_1", text: "o upload não tem retry" },
			{ kind: "agent", id: "msg_1", text: "Vou olhar o upload." },
		]);
	});

	it("grows the reasoning of one message from the chunks that share its id", () => {
		const blocks = parse([
			assistantRecord("msg_1", [{ type: "thinking", thinking: "primeiro", signature: "s1" }], "a1"),
			assistantRecord("msg_1", [{ type: "thinking", thinking: "depois", signature: "s2" }], "a2"),
		]).blocks;

		expect(blocks.at(-1)).toEqual({ kind: "thinking", id: "thinking-msg_1", text: "primeiro\ndepois" });
	});

	it("names a tool call after the tool that ran", () => {
		expect(
			parse([
				assistantRecord("msg_1", [
					{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/app/src/upload.ts" } },
				]),
			]).blocks,
		).toEqual([{ kind: "tool", id: "toolu_1", name: "Read", state: "running" }]);
	});

	it("drops the server prefix an mcp tool carries", () => {
		expect(
			parse([
				assistantRecord("msg_1", [{ type: "tool_use", id: "toolu_1", name: "mcp__context7__query-docs", input: {} }]),
			]).blocks,
		).toEqual([{ kind: "tool", id: "toolu_1", name: "query-docs", state: "running" }]);
	});

	it("marks a call that spawned a subagent as one you can open", () => {
		const call = assistantRecord("msg_1", [
			{ type: "tool_use", id: "toolu_1", name: "Agent", input: { name: "explorer", description: "Ler o parser" } },
		]);
		const answer = userRecord([{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }]);
		const blocks = parse([call, answer]).blocks;

		expect(blocks[0]).toMatchObject({ kind: "tool", id: "toolu_1", state: "running", agent: true });
		expect(blocks.at(-1)).toMatchObject({ kind: "tool", id: "toolu_1", state: "done", agent: true });
	});

	it("leaves a tool without an answer running", () => {
		expect(
			parse([assistantRecord("msg_1", [{ type: "tool_use", id: "toolu_1", name: "Bash", input: {} }])]).blocks,
		).toEqual([{ kind: "tool", id: "toolu_1", name: "Bash", state: "running" }]);
	});
});

describe("how a tool call is answered", () => {
	const call = assistantRecord("msg_1", [
		{ type: "tool_use", id: "toolu_1", name: "Bash", input: { description: "Rodar os testes" } },
	]);

	it("settles the row it belongs to instead of printing its output", () => {
		const blocks = parse([call, userRecord([{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }])]).blocks;

		expect(blocks.at(-1)).toEqual({ kind: "tool", id: "toolu_1", name: "Bash", state: "done" });
		expect(blocks).toHaveLength(2);
	});

	it("paints the row as failed when the tool errored", () => {
		const answer = userRecord([{ type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: "boom" }]);

		expect(parse([call, answer]).blocks.at(-1)).toEqual({
			kind: "tool",
			id: "toolu_1",
			name: "Bash",
			state: "failed",
		});
	});

	it("counts the lines an edit changed, without carrying the patch", () => {
		const edit = assistantRecord("msg_2", [
			{ type: "tool_use", id: "toolu_2", name: "Edit", input: { file_path: "/app/src/upload.ts" } },
		]);
		const answer = userRecord([{ type: "tool_result", tool_use_id: "toolu_2", content: "ok" }], {
			toolUseResult: {
				filePath: "/app/src/upload.ts",
				structuredPatch: [
					{ oldStart: 5, oldLines: 6, newStart: 5, newLines: 7, lines: [" import x", "+const retry = 3", "-const retry = 0"] },
					{ oldStart: 30, oldLines: 2, newStart: 31, newLines: 2, lines: ["+await sleep(retry)"] },
				],
			},
		});

		expect(parse([edit, answer]).blocks.at(-1)).toEqual({
			kind: "tool",
			id: "toolu_2",
			name: "Edit",
			state: "done",
			edit: { added: 2, removed: 1 },
		});
	});

	it("counts a file written from nothing by what was written into it", () => {
		const write = assistantRecord("msg_2", [
			{ type: "tool_use", id: "toolu_2", name: "Write", input: { file_path: "/app/src/retry.ts" } },
		]);
		const answer = userRecord([{ type: "tool_result", tool_use_id: "toolu_2", content: "ok" }], {
			toolUseResult: { type: "create", filePath: "/app/src/retry.ts", structuredPatch: [], content: "uma\nduas\n" },
		});

		expect(parse([write, answer]).blocks.at(-1)).toEqual({
			kind: "tool",
			id: "toolu_2",
			name: "Write",
			state: "done",
			edit: { added: 2, removed: 0 },
		});
	});

	it("settles a tool whose answer carries no patch as a plain row", () => {
		const answer = userRecord([{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }], {
			toolUseResult: { stdout: "tudo verde", stderr: "" },
		});

		expect(parse([call, answer]).blocks.at(-1)).toEqual({
			kind: "tool",
			id: "toolu_1",
			name: "Bash",
			state: "done",
		});
	});

	it("ignores an answer whose call was cut off by the backfill", () => {
		expect(parse([userRecord([{ type: "tool_result", tool_use_id: "toolu_lost", content: "ok" }])]).blocks).toEqual([]);
	});
});

describe("the records that are not conversation", () => {
	it("turns a compaction boundary into one divider", () => {
		const boundary = JSON.stringify({ type: "system", subtype: "compact_boundary", uuid: "s1", content: "x" });

		expect(parse([boundary]).blocks).toEqual([{ kind: "compacted", id: "s1" }]);
	});

	it("keeps the latest title the session was given", () => {
		const lines = [
			JSON.stringify({ type: "ai-title", aiTitle: "Retry no upload", sessionId: "x" }),
			JSON.stringify({ type: "custom-title", customTitle: "upload-retry", sessionId: "x" }),
		];

		expect(parse(lines)).toEqual({ blocks: [], title: "upload-retry" });
	});

	it("skips a line it cannot read at all", () => {
		expect(parse(["", "not json", JSON.stringify({ type: "mode", mode: "plan" })]).blocks).toEqual([]);
	});
});

describe("a line too big to hold in memory", () => {
	it("parses the record after dropping the inline image payload", () => {
		const heavy = JSON.stringify({
			type: "user",
			uuid: "u1",
			message: {
				content: [
					{ type: "image", source: { type: "base64", data: "A".repeat(CONVERSATION_LINE_LIMIT) } },
					{ type: "text", text: "esse print" },
				],
			},
		});

		expect(heavy.length).toBeGreaterThan(CONVERSATION_LINE_LIMIT);
		expect(parse([heavy]).blocks).toEqual([{ kind: "user", id: "u1", text: "[image]\nesse print" }]);
	});

	it("skips a line that stays oversized once the payloads are gone", () => {
		const heavy = userRecord("x".repeat(CONVERSATION_LINE_LIMIT + 1));

		expect(parse([heavy]).blocks).toEqual([]);
	});
});
