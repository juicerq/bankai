import { describe, expect, it } from "bun:test";
import { type ConversationBlock, mergeConversationBlocks } from "@shared/conversation";

const PROMPT: ConversationBlock = { kind: "user", id: "u1", text: "roda os testes" };
const CALL: ConversationBlock = { kind: "tool", id: "toolu_1", label: "Running commands", state: "running" };

describe("how a client folds a push into the conversation it already has", () => {
	it("appends what it has never seen, in the order the file wrote it", () => {
		expect(mergeConversationBlocks([PROMPT], [CALL])).toEqual([PROMPT, CALL]);
	});

	it("settles a tool row in place instead of repeating it", () => {
		const done: ConversationBlock = { ...CALL, state: "done" };

		expect(mergeConversationBlocks([PROMPT, CALL], [done])).toEqual([PROMPT, done]);
	});

	it("keeps an agent message where it started when it grows", () => {
		const started: ConversationBlock = { kind: "agent", id: "msg_1", text: "Vou olhar." };
		const grown: ConversationBlock = { kind: "agent", id: "msg_1", text: "Vou olhar.\nSem retry." };

		expect(mergeConversationBlocks([started, CALL], [grown])).toEqual([grown, CALL]);
	});

	it("takes the last word when one push both adds and settles a row", () => {
		const done: ConversationBlock = { ...CALL, state: "done" };

		expect(mergeConversationBlocks([], [CALL, done])).toEqual([done]);
	});

	it("leaves the conversation untouched when nothing arrived", () => {
		const blocks = [PROMPT];

		expect(mergeConversationBlocks(blocks, [])).toBe(blocks);
	});
});
