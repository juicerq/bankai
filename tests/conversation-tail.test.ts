import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { CONVERSATION_BACKFILL_BYTES, ConversationTail } from "@main/activity/conversationTail";
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

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 1200));
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
		const tail = new ConversationTail(transcript([userLine("u1", "primeiro"), userLine("u2", "segundo")]), sink.onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot).toEqual({
			blocks: [
				{ kind: "user", id: "u1", text: "primeiro" },
				{ kind: "user", id: "u2", text: "segundo" },
			],
			title: undefined,
			truncated: false,
		});
	});

	it("carries the title the session was given", async () => {
		const sink = collect();
		const tail = new ConversationTail(transcript([titleLine("Retry no upload"), userLine("u1", "oi")]), sink.onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot.title).toBe("Retry no upload");
	});

	it("cuts the backfill forward to a line boundary and says it was cut", async () => {
		const sink = collect();
		const padding = userLine("old", "x".repeat(CONVERSATION_BACKFILL_BYTES));
		const tail = new ConversationTail(
			transcript([padding, userLine("u1", "primeiro"), userLine("u2", "segundo")]),
			sink.onAppended,
		);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot.truncated).toBe(true);
		expect(snapshot.blocks).toEqual([
			{ kind: "user", id: "u1", text: "primeiro" },
			{ kind: "user", id: "u2", text: "segundo" },
		]);
	});

	it("is empty and quiet when the agent has written no transcript yet", async () => {
		const sink = collect();
		const directory = mkdtempSync(join(tmpdir(), "bankai-conversation-"));
		directories.push(directory);
		const tail = new ConversationTail(join(directory, "missing.jsonl"), sink.onAppended);

		const snapshot = await tail.start();
		tail.stop();

		expect(snapshot).toEqual({ blocks: [], title: undefined, truncated: false });
	});
});

describe("what the phone gets while the agent keeps writing", () => {
	it("pushes the records appended after the backfill, once each", async () => {
		const sink = collect();
		const path = transcript([userLine("u1", "primeiro")]);
		const tail = new ConversationTail(path, sink.onAppended);

		await tail.start();
		appendFileSync(path, `${userLine("u2", "segundo")}\n`);
		await settle();
		tail.stop();

		expect(sink.appended).toEqual([{ kind: "user", id: "u2", text: "segundo" }]);
	});

	it("waits for a record to be complete before parsing it", async () => {
		const sink = collect();
		const path = transcript([userLine("u1", "primeiro")]);
		const tail = new ConversationTail(path, sink.onAppended);

		await tail.start();
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
		const tail = new ConversationTail(path, sink.onAppended);

		await tail.start();
		tail.stop();
		appendFileSync(path, `${userLine("u2", "segundo")}\n`);
		await settle();

		expect(sink.appended).toEqual([]);
	});
});
