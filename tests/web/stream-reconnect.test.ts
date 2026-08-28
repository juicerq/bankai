import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";
import { streamResync } from "@renderer/lib/stream/resync";
import { reconnectDelay, StreamSocket } from "@renderer/lib/stream/socket";
import { streamStatus } from "@renderer/lib/stream/status";
import { DAEMON_PROTOCOL_VERSION } from "@shared/daemon";
import { streamVoidSchema } from "@shared/stream";
import { type } from "arktype";

const UNWATCHED_KEY = orpc.projects.list.queryOptions().queryKey;
const WATCHED_KEY = orpc.services.output.queryOptions({ input: { commandId: "svc" } }).queryKey;

const releaseTransport = streamTransport.borrow();
const realFetch = globalThis.fetch;
const sockets: StreamSocket[] = [];

afterAll(releaseTransport);

streamTransport.handle("review", "watch", () => new Promise(() => {}));

async function settle(ticks = 4) {
	for (let tick = 0; tick < ticks; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

async function backoff() {
	await new Promise((resolve) => setTimeout(resolve, reconnectDelay(0) + 50));
	await settle();
}

async function connected() {
	const socket = new StreamSocket();
	sockets.push(socket);
	socket.on("activity", "changed", type("unknown"), () => {});
	await settle();

	return socket;
}

beforeEach(() => {
	streamTransport.reset();
	queryClient.clear();
	globalThis.fetch = Object.assign(
		() => Promise.resolve(new Response(null, { status: 404 })),
		{ preconnect: realFetch.preconnect },
	);
});

afterEach(() => {
	globalThis.fetch = realFetch;
	for (const socket of sockets.splice(0)) {
		socket.dispose();
	}

	streamStatus.set("open");
});

test("the backoff grows with every failed attempt and then holds at its cap", () => {
	expect([0, 1, 2, 3, 4, 5, 12].map(reconnectDelay)).toEqual([250, 500, 1000, 2000, 5000, 10_000, 10_000]);
});

test("a request still waiting when the socket drops rejects instead of hanging", async () => {
	const socket = await connected();
	const pending = socket.request("review", "watch", { projectId: "p1" }, streamVoidSchema);

	streamTransport.disconnect();
	const outcome = await pending.catch((err: Error) => err.message);

	expect(outcome).toBe("Bankai stream disconnected");

	await backoff();
});

test("a dropped socket reconnects on its own and reports the outage while it is out", async () => {
	await connected();

	expect(streamStatus.get()).toBe("open");

	streamTransport.disconnect();

	expect(streamStatus.get()).toBe("reconnecting");

	await backoff();

	expect(streamStatus.get()).toBe("open");
	expect(streamTransport.connections).toBe(2);
});

test("retrying by hand reconnects without waiting out the backoff", async () => {
	const socket = await connected();
	streamTransport.disconnect();

	socket.retry();
	await settle();

	expect(streamStatus.get()).toBe("open");
	expect(streamTransport.connections).toBe(2);
});

test("a reconnect re-subscribes every watch, then invalidates, then reattaches the terminals", async () => {
	const order: string[] = [];
	const stopWatch = streamResync.register("watch", () => {
		order.push("watch");
	});
	const stopTerminal = streamResync.register("terminal", () => {
		order.push("terminal");
	});
	const stopCache = queryClient.getQueryCache().subscribe((event) => {
		if (event.type === "updated" && event.action.type === "invalidate") {
			order.push("invalidate");
		}
	});
	queryClient.setQueryData(UNWATCHED_KEY, []);
	await connected();

	expect(order).toEqual([]);

	streamTransport.disconnect();
	await backoff();

	expect(order).toEqual(["watch", "invalidate", "terminal"]);

	stopWatch();
	stopTerminal();
	stopCache();
});

test("a reconnect leaves the reads the watch stage pushes back untouched", async () => {
	const invalidated: unknown[] = [];
	const stopCache = queryClient.getQueryCache().subscribe((event) => {
		if (event.type === "updated" && event.action.type === "invalidate") {
			invalidated.push(event.query.queryKey);
		}
	});
	queryClient.setQueryData(WATCHED_KEY, "seeded");
	queryClient.setQueryData(UNWATCHED_KEY, []);
	await connected();

	streamTransport.disconnect();
	await backoff();

	expect(invalidated).toEqual([UNWATCHED_KEY]);

	stopCache();
});

test("a server announcing a different protocol stops the client instead of talking to it", async () => {
	const socket = await connected();
	streamTransport.protocol = DAEMON_PROTOCOL_VERSION + 1;

	streamTransport.disconnect();
	await backoff();

	expect(streamStatus.get()).toBe("outdated");

	socket.send("activity", "unwatch", { projectId: "p1" });
	await settle();

	expect(streamTransport.payloads("activity", "unwatch")).toEqual([]);
});

test("a watch queued before the very first connection is re-issued once the socket opens", async () => {
	const rewatched: string[] = [];
	const stopWatch = streamResync.register("watch", () => {
		rewatched.push("watch");
	});
	streamTransport.failNext = true;

	const socket = new StreamSocket();
	sockets.push(socket);
	socket.send("activity", "watch-attention");
	await settle();

	expect(rewatched).toEqual([]);

	await backoff();

	expect(rewatched).toEqual(["watch"]);

	stopWatch();
});

test("an app updated under an open window asks it to restart", async () => {
	await connected();
	streamTransport.version = "99.0.0";

	streamTransport.disconnect();
	await backoff();

	expect(streamStatus.get()).toBe("outdated");
});

test("the same app across a reconnect keeps the window talking", async () => {
	await connected();

	streamTransport.disconnect();
	await backoff();

	expect(streamStatus.get()).toBe("open");
});

test("a malformed server message never reaches a stream listener", async () => {
	const received: unknown[] = [];
	const socket = new StreamSocket();
	sockets.push(socket);
	socket.on("activity", "changed", type({ projectId: "string" }), (payload) => received.push(payload));
	await settle();

	streamTransport.pushRaw(JSON.stringify({ channel: "unknown", type: "changed", payload: "unsafe" }));
	streamTransport.pushRaw("not json");
	streamTransport.pushRaw(JSON.stringify({ channel: "system", type: "hello", payload: { protocol: "one" } }));
	streamTransport.push("activity", "changed", "unsafe");
	await settle();

	expect(received).toEqual([]);
	expect(streamStatus.get()).toBe("open");
});

test("a malformed reply rejects its request", async () => {
	streamTransport.handle("activity", "watch", () => "unsafe");
	const socket = await connected();
	const pending = socket.request("activity", "watch", {}, type({ projectId: "string" }));
	const outcome = await pending.catch((err: Error) => err.message);

	expect(outcome).toContain("Invalid Bankai stream reply");
});
