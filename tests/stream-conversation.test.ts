import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { type } from "arktype";
import { WebSocket } from "ws";
import { transcriptPath } from "@main/agents/harness/claude/claude-transcript";
import { CONVERSATION_BACKFILL_BYTES } from "@main/agents/transcript/conversation-tail";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import { handleConversationMessage } from "@main/transport/stream/conversation-messages";
import type { StreamEnvelope } from "@shared/stream";
import { assertDefined } from "./utils/assertions";

const SESSION = { sessionId: "c1", cwd: "/home/jui/app", harness: "claude" };

let claudeHome: string | undefined;

beforeEach(() => {
	claudeHome = mkdtempSync(join(tmpdir(), "bankai-claude-"));
	process.env.CLAUDE_CONFIG_DIR = claudeHome;
});

afterEach(() => {
	if (claudeHome) {
		rmSync(claudeHome, { recursive: true, force: true });
	}

	claudeHome = undefined;
	delete process.env.CLAUDE_CONFIG_DIR;
});

function userLine(uuid: string, text: string): string {
	return JSON.stringify({ type: "user", uuid, message: { content: text } });
}

function writeTranscript(lines: string[]): void {
	const path = transcriptPath(SESSION);
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, lines.map((line) => `${line}\n`).join(""));
}

function writeShell(): void {
	assertDefined(process.env.DATA_DIR);
	writeFileSync(
		join(process.env.DATA_DIR, "continuity.json"),
		JSON.stringify({
			version: 6,
			data: {
				workspaces: [{
					projectId: "p1",
					shells: [{ id: "s1", label: "Shell 1", createdAt: Date.now(), session: SESSION }],
				}],
			},
		}),
	);
}

function connected() {
	const sent: StreamEnvelope[] = [];
	const connection = new StreamConnection({
		readyState: WebSocket.OPEN,
		send: (data) => void sent.push(JSON.parse(data)),
	});

	return { connection, sent };
}

const snapshotSchema = type({
	blocks: type({ id: "string" }).array(),
	startOffset: "number",
	atStart: "boolean",
});

const resetSchema = snapshotSchema.and({ shellId: "string" });

function resets(sent: StreamEnvelope[]) {
	return sent.filter((envelope) => envelope.type === "reset").map((envelope) => resetSchema.assert(envelope.payload));
}

async function subscribe(connection: StreamConnection, agent?: string) {
	return snapshotSchema.assert(
		await handleConversationMessage(connection, {
			channel: "conversation",
			type: "subscribe",
			payload: agent ? { shellId: "s1", agent } : { shellId: "s1" },
		}),
	);
}

function writeSubagent(file: string, meta: Record<string, string>, lines: string[]): void {
	const directory = join(transcriptPath(SESSION), "..", SESSION.sessionId, "subagents");
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, `${file}.meta.json`), JSON.stringify(meta));
	writeFileSync(join(directory, `${file}.jsonl`), lines.map((line) => `${line}\n`).join(""));
}

function agentCallLine(toolUseId: string): string {
	return JSON.stringify({
		type: "assistant",
		uuid: `a-${toolUseId}`,
		message: {
			id: `msg-${toolUseId}`,
			content: [{
				type: "tool_use",
				id: toolUseId,
				name: "Agent",
				input: { name: "explorer", description: "Ler o parser" },
			}],
		},
	});
}

async function history(connection: StreamConnection, before: number): Promise<void> {
	await handleConversationMessage(connection, {
		channel: "conversation",
		type: "history",
		payload: { shellId: "s1", before },
	});
}

const PADDING_BYTES = 64 * 1024;

function padding(count: number): string[] {
	return Array.from({ length: count }, (_, index) => userLine(`f${index}`, "x".repeat(PADDING_BYTES)));
}

test("a step back opens the transcript lower and pushes the whole conversation again", async () => {
	writeTranscript([...padding(3 * CONVERSATION_BACKFILL_BYTES / PADDING_BYTES), userLine("u1", "primeiro")]);
	writeShell();
	const { connection, sent } = connected();

	const snapshot = await subscribe(connection);

	expect(snapshot.atStart).toBe(false);
	expect(snapshot.blocks.at(-1)?.id).toBe("u1");

	await history(connection, snapshot.startOffset);

	const [reset] = resets(sent);
	assertDefined(reset);
	expect(reset.shellId).toBe("s1");
	expect(reset.atStart).toBe(false);
	expect(reset.startOffset).toBeLessThan(snapshot.startOffset);
	expect(reset.blocks.length).toBeGreaterThan(snapshot.blocks.length);
	expect(reset.blocks.slice(-snapshot.blocks.length)).toEqual(snapshot.blocks);
	expect(reset.blocks[0]?.id).not.toBe(snapshot.blocks[0]?.id);

	handleConversationMessage(connection, { channel: "conversation", type: "unsubscribe", payload: { shellId: "s1" } });
});

test("stepping past the first byte says the conversation starts there", async () => {
	writeTranscript([...padding(CONVERSATION_BACKFILL_BYTES / PADDING_BYTES + 2), userLine("u1", "primeiro")]);
	writeShell();
	const { connection, sent } = connected();

	const snapshot = await subscribe(connection);
	await history(connection, snapshot.startOffset);

	const [reset] = resets(sent);
	assertDefined(reset);
	expect(reset.atStart).toBe(true);
	expect(reset.startOffset).toBe(0);
	expect(reset.blocks[0]?.id).toBe("f0");

	handleConversationMessage(connection, { channel: "conversation", type: "unsubscribe", payload: { shellId: "s1" } });
});

test("a cursor that no longer matches the watch is dropped instead of re-read", async () => {
	writeTranscript([...padding(CONVERSATION_BACKFILL_BYTES / PADDING_BYTES + 2), userLine("u1", "primeiro")]);
	writeShell();
	const { connection, sent } = connected();

	const snapshot = await subscribe(connection);
	await history(connection, snapshot.startOffset + 7);

	expect(resets(sent)).toEqual([]);

	handleConversationMessage(connection, { channel: "conversation", type: "unsubscribe", payload: { shellId: "s1" } });
});

test("a subagent named by its tool use id is read from its own transcript", async () => {
	writeTranscript([agentCallLine("toolu_a"), userLine("u1", "primeiro")]);
	writeSubagent("agent-aexplorer-1", { toolUseId: "toolu_a" }, [userLine("sub1", "dentro do subagente")]);
	writeShell();
	const { connection } = connected();

	const snapshot = await subscribe(connection, "toolu_a");

	expect(snapshot.blocks.map((block) => block.id)).toEqual(["sub1"]);

	handleConversationMessage(connection, {
		channel: "conversation",
		type: "unsubscribe",
		payload: { shellId: "s1", agent: "toolu_a" },
	});
});

test("a sidecar that only knows the agent's name is matched by the call that spawned it", async () => {
	writeTranscript([agentCallLine("toolu_a"), userLine("u1", "primeiro")]);
	writeSubagent("agent-aexplorer-1", { name: "explorer", description: "Ler o parser" }, [
		userLine("sub1", "dentro do subagente"),
	]);
	writeSubagent("agent-aother-2", { name: "reviewer", description: "Outra coisa" }, [userLine("sub2", "outro")]);
	writeShell();
	const { connection } = connected();

	const snapshot = await subscribe(connection, "toolu_a");

	expect(snapshot.blocks.map((block) => block.id)).toEqual(["sub1"]);
});

test("a subagent whose transcript is nowhere reads as an empty conversation", async () => {
	writeTranscript([agentCallLine("toolu_a"), userLine("u1", "primeiro")]);
	writeShell();
	const { connection } = connected();

	const snapshot = await subscribe(connection, "toolu_a");

	expect(snapshot.blocks).toEqual([]);
	expect(snapshot.atStart).toBe(true);
});

test("the shell's own conversation is not disturbed by a subagent watched next to it", async () => {
	writeTranscript([agentCallLine("toolu_a"), userLine("u1", "primeiro")]);
	writeSubagent("agent-aexplorer-1", { toolUseId: "toolu_a" }, [userLine("sub1", "dentro do subagente")]);
	writeShell();
	const { connection } = connected();

	const shell = await subscribe(connection);
	const agent = await subscribe(connection, "toolu_a");

	expect(shell.blocks.map((block) => block.id)).toEqual(["toolu_a", "u1"]);
	expect(agent.blocks.map((block) => block.id)).toEqual(["sub1"]);
});

test("a shell nobody subscribed to has no history to give", async () => {
	writeTranscript([userLine("u1", "primeiro")]);
	writeShell();
	const { connection, sent } = connected();

	await history(connection, 1024);

	expect(resets(sent)).toEqual([]);
});
