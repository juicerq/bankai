import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { ConversationParser } from "@main/agents/harness/claude/claude-conversation";
import { CONVERSATION_BACKFILL_BYTES, ConversationTail } from "@main/agents/transcript/conversation-tail";
import type { ConversationBlock } from "@shared/conversation";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function transcript(lines: string[]): string {
	const directory = mkdtempSync(join(tmpdir(), "bankai-conversation-"));
	directories.push(directory);
	const path = join(directory, "session.jsonl");
	writeFileSync(path, lines.map((line) => `${line}\n`).join(""));

	return path;
}

function userLine(uuid: string, text: string): string {
	return JSON.stringify({ type: "user", uuid, message: { content: text } });
}

function titleLine(title: string): string {
	return JSON.stringify({ type: "ai-title", aiTitle: title, sessionId: "s1" });
}

const WATCH_INTERVAL_MS = 10;

function follow(path: string, onAppended: (event: { blocks: ConversationBlock[]; title?: string }) => void) {
	return new ConversationTail({
		path,
		onAppended,
		parser: new ConversationParser(),
		watchIntervalMs: WATCH_INTERVAL_MS,
	});
}

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, WATCH_INTERVAL_MS * 8));
}

function collect() {
	const appended: ConversationBlock[] = [];
	const titles: (string | undefined)[] = [];

	return {
		appended,
		titles,
		onAppended: (event: { blocks: ConversationBlock[]; title?: string }) => {
			appended.push(...event.blocks);
			titles.push(event.title);
		},
	};
}

describe("the history the phone gets when it opens a conversation", () => {
	it("reads the whole transcript when it fits in the backfill", async () => {
		const sink = collect();
		const tail = follow(transcript([userLine("u1", "primeiro"), userLine("u2", "segundo")]), sink.onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot).toEqual({
			blocks: [
				{ kind: "user", id: "u1", text: "primeiro" },
				{ kind: "user", id: "u2", text: "segundo" },
			],
			title: undefined,
			startOffset: 0,
			atStart: true,
		});
	});

	it("carries the title the session was given", async () => {
		const sink = collect();
		const tail = follow(transcript([titleLine("Retry no upload"), userLine("u1", "oi")]), sink.onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot.title).toBe("Retry no upload");
	});

	it("cuts the backfill forward to a line boundary and says it was cut", async () => {
		const sink = collect();
		const padding = userLine("old", "x".repeat(CONVERSATION_BACKFILL_BYTES));
		const tail = follow(
			transcript([padding, userLine("u1", "primeiro"), userLine("u2", "segundo")]),
			sink.onAppended,
		);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot.atStart).toBe(false);
		expect(snapshot.startOffset).toBeGreaterThan(0);
		expect(snapshot.blocks).toEqual([
			{ kind: "user", id: "u1", text: "primeiro" },
			{ kind: "user", id: "u2", text: "segundo" },
		]);
	});

	it("reads a call and its result as one step, already settled", async () => {
		const call = JSON.stringify({
			type: "assistant",
			uuid: "a1",
			message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }] },
		});
		const result = JSON.stringify({
			type: "user",
			uuid: "u2",
			message: { content: [{ type: "tool_result", tool_use_id: "t1" }] },
		});
		const tail = follow(transcript([call, result, userLine("u3", "obrigado")]), collect().onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot.blocks).toEqual([
			{ kind: "tool", id: "t1", name: "Read", state: "done" },
			{ kind: "user", id: "u3", text: "obrigado" },
		]);
	});

	it("is empty and quiet when the agent has written no transcript yet", async () => {
		const sink = collect();
		const directory = mkdtempSync(join(tmpdir(), "bankai-conversation-"));
		directories.push(directory);
		const tail = follow(join(directory, "missing.jsonl"), sink.onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot).toEqual({ blocks: [], title: undefined, startOffset: 0, atStart: true });
	});
});

describe("the history the phone asks for when it pulls the top", () => {
	it("reads from the offset it was given, forward to the line boundary", async () => {
		const sink = collect();
		const first = `${userLine("u1", "primeiro")}\n`;
		const path = transcript([userLine("u1", "primeiro"), userLine("u2", "segundo"), userLine("u3", "terceiro")]);
		const tail = follow(path, sink.onAppended);

		const snapshot = await tail.start(first.length + 4);
		tail.stop();

		expect(snapshot.blocks).toEqual([{ kind: "user", id: "u3", text: "terceiro" }]);
		expect(snapshot.startOffset).toBe(first.length + 4);
		expect(snapshot.atStart).toBe(false);
	});

	it("settles a tool whose call sits above the offset once the step reaches it", async () => {
		const call = JSON.stringify({
			type: "assistant",
			uuid: "a1",
			message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }] },
		});
		const result = JSON.stringify({
			type: "user",
			uuid: "u2",
			message: { content: [{ type: "tool_result", tool_use_id: "t1" }] },
		});
		const path = transcript([call, result]);

		const cut = follow(path, collect().onAppended);
		const partial = await cut.start(call.length + 1);
		cut.stop();

		expect(partial.blocks).toEqual([]);

		const whole = follow(path, collect().onAppended);
		const stepped = await whole.start(0);
		whole.stop();

		expect(stepped.blocks.at(-1)).toEqual({ kind: "tool", id: "t1", name: "Read", state: "done" });
	});
});

describe("what the phone gets while the agent keeps writing", () => {
	it("pushes the records appended after the backfill, once each", async () => {
		const sink = collect();
		const path = transcript([userLine("u1", "primeiro")]);
		const tail = follow(path, sink.onAppended);

		await tail.start();
		await settle();
		appendFileSync(path, `${userLine("u2", "segundo")}\n`);
		await settle();
		tail.stop();

		expect(sink.appended).toEqual([{ kind: "user", id: "u2", text: "segundo" }]);
	});

	it("waits for a record to be complete before parsing it", async () => {
		const sink = collect();
		const path = transcript([userLine("u1", "primeiro")]);
		const tail = follow(path, sink.onAppended);

		await tail.start();
		await settle();
		const half = userLine("u2", "segundo");
		appendFileSync(path, half.slice(0, 20));
		await settle();

		expect(sink.appended).toEqual([]);

		appendFileSync(path, `${half.slice(20)}\n`);
		await settle();
		tail.stop();

		expect(sink.appended).toEqual([{ kind: "user", id: "u2", text: "segundo" }]);
	});

	it("stops reading once the phone leaves the conversation", async () => {
		const sink = collect();
		const path = transcript([userLine("u1", "primeiro")]);
		const tail = follow(path, sink.onAppended);

		await tail.start();
		tail.stop();
		appendFileSync(path, `${userLine("u2", "segundo")}\n`);
		await settle();

		expect(sink.appended).toEqual([]);
	});
});
