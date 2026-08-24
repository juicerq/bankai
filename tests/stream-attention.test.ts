import { beforeEach, expect, test } from "bun:test";
import { WebSocket } from "ws";
import { ATTENTION_RETAINED_MAX, AttentionSignal } from "@main/agents/attention-signal";
import { ActivityMessages } from "@main/transport/stream/activity-messages";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import type { StreamEnvelope } from "@shared/stream";

function connected() {
	const sent: StreamEnvelope[] = [];
	const connection = new StreamConnection({
		readyState: WebSocket.OPEN,
		send: (data) => sent.push(JSON.parse(data)),
	});

	return { connection, sent };
}

function watch(connection: StreamConnection) {
	return ActivityMessages.handle(connection, { channel: "activity", type: "watch-attention" });
}

beforeEach(async () => {
	const { connection } = connected();

	await watch(connection);
	connection.close();
});

test("a client watching attention receives the reason and the count that were raised", async () => {
	const { connection, sent } = connected();

	await watch(connection);
	AttentionSignal.raise({ reason: "needs-attention", count: 2 });

	expect(sent).toEqual([{ channel: "activity", type: "attention", payload: { reason: "needs-attention", count: 2 } }]);

	connection.close();
});

test("a closed client stops receiving attention", async () => {
	const { connection, sent } = connected();

	await watch(connection);
	connection.close();
	AttentionSignal.raise({ reason: "done", count: 1 });

	expect(sent).toEqual([]);
});

test("watching twice still announces attention once", async () => {
	const { connection, sent } = connected();

	await watch(connection);
	await watch(connection);
	AttentionSignal.raise({ reason: "done", count: 3 });

	expect(sent).toHaveLength(1);

	connection.close();
});

test("attention raised before anyone listens reaches the first listener", async () => {
	AttentionSignal.raise({ reason: "needs-attention", count: 1 });
	AttentionSignal.raise({ reason: "done", count: 4 });

	const { connection, sent } = connected();
	await watch(connection);

	expect(sent.map((envelope) => envelope.payload)).toEqual([
		{ reason: "needs-attention", count: 1 },
		{ reason: "done", count: 4 },
	]);

	connection.close();
});

test("the retained attention is handed over once, not again to the next listener", async () => {
	AttentionSignal.raise({ reason: "done", count: 1 });

	const first = connected();
	await watch(first.connection);
	first.connection.close();

	const second = connected();
	await watch(second.connection);

	expect(second.sent).toEqual([]);

	second.connection.close();
});

test("a long outage keeps only the most recent attention", async () => {
	for (let raise = 0; raise < ATTENTION_RETAINED_MAX + 5; raise++) {
		AttentionSignal.raise({ reason: "done", count: raise });
	}

	const { connection, sent } = connected();
	await watch(connection);

	expect(sent).toHaveLength(ATTENTION_RETAINED_MAX);
	expect(sent.at(-1)?.payload).toEqual({ reason: "done", count: ATTENTION_RETAINED_MAX + 4 });

	connection.close();
});
