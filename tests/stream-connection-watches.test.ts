import { expect, test } from "bun:test";
import { WebSocket } from "ws";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import { ConnectionWatches } from "@main/transport/stream/connection-watches";

function connected() {
	return new StreamConnection({ readyState: WebSocket.CLOSED, send: () => {} });
}

function counter() {
	const stops = { count: 0 };

	return { stops, stop: () => (stops.count += 1) };
}

const ADDRESS = { channel: "activity", key: "p1" } as const;

test("watchers of the same thing share one subscription until the last one lets go", async () => {
	const connection = connected();
	const { stops, stop } = counter();

	await ConnectionWatches.retain({ connection, ...ADDRESS }, () => stop);
	await ConnectionWatches.retain({ connection, ...ADDRESS }, () => stop);
	ConnectionWatches.release({ connection, ...ADDRESS });

	expect(stops.count).toBe(0);

	ConnectionWatches.release({ connection, ...ADDRESS });

	expect(stops.count).toBe(1);
});

test("a subscription that lands after the connection closed stops itself", async () => {
	const connection = connected();
	const { stops, stop } = counter();
	connection.close();

	await ConnectionWatches.retain({ connection, ...ADDRESS }, () => stop);

	expect(stops.count).toBe(1);
});

test("a subscription that lands after its watcher let go stops itself", async () => {
	const connection = connected();
	const { stops, stop } = counter();

	const retained = ConnectionWatches.retain({ connection, ...ADDRESS }, async () => {
		await Bun.sleep(1);

		return stop;
	});
	ConnectionWatches.release({ connection, ...ADDRESS });
	await retained;

	expect(stops.count).toBe(1);
});

test("a subscription that failed to start leaves the key free for another try", async () => {
	const connection = connected();
	const { stops, stop } = counter();

	const failure = await ConnectionWatches.retain({ connection, ...ADDRESS }, () => {
		throw new Error("no such worktree");
	}).catch((err) => String(err));

	expect(failure).toInclude("no such worktree");

	await ConnectionWatches.retain({ connection, ...ADDRESS }, () => stop);
	ConnectionWatches.release({ connection, ...ADDRESS });

	expect(stops.count).toBe(1);
});

test("replacing a watch stops the one it supersedes", () => {
	const connection = connected();
	const first = counter();
	const second = counter();

	ConnectionWatches.replace({ connection, channel: "conversation", key: "s1" }, first.stop);
	ConnectionWatches.replace({ connection, channel: "conversation", key: "s1" }, second.stop);

	expect(first.stops.count).toBe(1);
	expect(second.stops.count).toBe(0);

	connection.close();

	expect(second.stops.count).toBe(1);
});
