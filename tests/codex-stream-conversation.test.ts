import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { type } from "arktype";
import { WebSocket } from "ws";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import { handleConversationMessage } from "@main/transport/stream/conversation-messages";

const SESSION_ID = "019fb897-3f89-77e0-9fea-5f059c48f5a3";

const snapshotSchema = type({
	blocks: type({ kind: "string", id: "string", "text?": "string" }).array(),
});

let codexHome: string | undefined;

beforeEach(() => {
	codexHome = mkdtempSync(join(tmpdir(), "bankai-codex-mobile-"));
	process.env.CODEX_HOME = codexHome;
});

afterEach(() => {
	if (codexHome) {
		rmSync(codexHome, { recursive: true, force: true });
	}

	codexHome = undefined;
	delete process.env.CODEX_HOME;
});

test("the conversation stream serves a persisted Codex session to the phone", async () => {
	if (!codexHome) {
		throw new Error("Codex test home is required");
	}

	const directory = join(codexHome, "sessions", "2026", "07", "31");
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, `rollout-2026-07-31T12-00-00-${SESSION_ID}.jsonl`),
		[
			JSON.stringify({
				timestamp: "2026-07-31T12:00:00.000Z",
				type: "event_msg",
				payload: { type: "user_message", message: "adiciona retry" },
			}),
			JSON.stringify({
				timestamp: "2026-07-31T12:00:01.000Z",
				type: "response_item",
				payload: {
					type: "message",
					id: "m1",
					role: "assistant",
					phase: "final_answer",
					content: [{ type: "output_text", text: "Pronto." }],
				},
			}),
		].map((line) => `${line}\n`).join(""),
	);

	if (!process.env.DATA_DIR) {
		throw new Error("Test data directory is required");
	}

	writeFileSync(
		join(process.env.DATA_DIR, "continuity.json"),
		JSON.stringify({
			version: 6,
			data: {
				workspaces: [{
					projectId: "p1",
					shells: [{
						id: "s1",
						label: "Shell 1",
						createdAt: Date.now(),
						session: { sessionId: SESSION_ID, cwd: "/home/jui/app", harness: "codex" },
					}],
				}],
			},
		}),
	);

	const connection = new StreamConnection({ readyState: WebSocket.OPEN, send: () => {} });
	const snapshot = snapshotSchema.assert(await handleConversationMessage(connection, {
		channel: "conversation",
		type: "subscribe",
		payload: { shellId: "s1" },
	}));

	expect(snapshot.blocks).toEqual([
		{ kind: "user", id: "user-2026-07-31T12:00:00.000Z", text: "adiciona retry" },
		{ kind: "agent", id: "m1", text: "Pronto." },
	]);

	handleConversationMessage(connection, {
		channel: "conversation",
		type: "unsubscribe",
		payload: { shellId: "s1" },
	});
});
