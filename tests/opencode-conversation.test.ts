import { describe, expect, test } from "bun:test";
import { OpencodeConversationParser } from "@main/agents/harness/opencode/opencode-conversation";

function line(part: Record<string, unknown>, role = "assistant"): string {
	return JSON.stringify({ id: part.callID ?? part.id, role, data: part });
}

describe("the opencode conversation", () => {
	test("the user prompt and the agent reply become message blocks", () => {
		const parser = new OpencodeConversationParser();
		const user = parser.consume(
			line({ id: "prt_u1", type: "text", text: "arruma esse bug" }, "user"),
		);
		const agent = parser.consume(line({ id: "prt_a1", type: "text", text: "arrumado." }));

		expect(user).toEqual([{ kind: "user", id: "prt_u1", text: "arruma esse bug" }]);
		expect(agent).toEqual([{ kind: "agent", id: "prt_a1", text: "arrumado." }]);
	});

	test("reasoning becomes a thinking block", () => {
		const parser = new OpencodeConversationParser();

		expect(parser.consume(line({ id: "prt_r1", type: "reasoning", text: "pensando..." }))).toEqual([
			{ kind: "thinking", id: "prt_r1", text: "pensando..." },
		]);
	});

	test("a tool call runs and then settles by its own state", () => {
		const parser = new OpencodeConversationParser();
		const started = parser.consume(
			line({
				callID: "call_1",
				type: "tool",
				tool: "bash",
				state: { status: "running", input: { command: "bun test" } },
			}),
		);
		const finished = parser.consume(
			line({
				callID: "call_1",
				type: "tool",
				tool: "bash",
				state: { status: "completed", input: { command: "bun test" }, output: "ok" },
			}),
		);

		expect(started).toEqual([{ kind: "tool", id: "call_1", name: "bash", state: "running" }]);
		expect(finished).toEqual([{ kind: "tool", id: "call_1", name: "bash", state: "done" }]);
	});

	test("a failed tool settles as failed", () => {
		const parser = new OpencodeConversationParser();

		expect(
			parser.consume(line({ callID: "call_2", type: "tool", tool: "read", state: { status: "error" } })),
		).toEqual([{ kind: "tool", id: "call_2", name: "read", state: "failed" }]);
	});

	test("a delegated task points at the subagent route", () => {
		const parser = new OpencodeConversationParser();

		expect(
			parser.consume(line({ callID: "call_3", type: "tool", tool: "task", state: { status: "running" } })),
		).toEqual([{ kind: "tool", id: "call_3", name: "task", state: "running", agent: true }]);
	});

	test("compaction is its own block", () => {
		const parser = new OpencodeConversationParser();

		expect(parser.consume(line({ id: "prt_c1", type: "compaction", auto: true }))).toEqual([
			{ kind: "compacted", id: "prt_c1" },
		]);
	});

	test("internal bookkeeping parts never reach the reader", () => {
		const parser = new OpencodeConversationParser();

		expect(parser.consume(line({ id: "prt_s1", type: "step-start" }))).toEqual([]);
		expect(parser.consume(line({ id: "prt_s2", type: "step-finish" }))).toEqual([]);
		expect(parser.consume(line({ id: "prt_p1", type: "patch", files: ["/a.ts"] }))).toEqual([]);
		expect(parser.consume("not json at all")).toEqual([]);
	});

	test("a part rewritten with the same words stays quiet", () => {
		const parser = new OpencodeConversationParser();
		const part = { id: "prt_a1", type: "text", text: "arrumado." };

		expect(parser.consume(line(part)).length).toBe(1);
		expect(parser.consume(line(part)).length).toBe(0);
	});

	test("a part that grows while streaming re-emits under the same id", () => {
		const parser = new OpencodeConversationParser();

		expect(parser.consume(line({ id: "prt_a2", type: "text", text: "par" })).length).toBe(1);
		expect(parser.consume(line({ id: "prt_a2", type: "text", text: "parte inteira" }))).toEqual([
			{ kind: "agent", id: "prt_a2", text: "parte inteira" },
		]);
	});
});
