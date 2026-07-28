import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { queryClient } from "@renderer/lib/query-client";
import { streamResync } from "@renderer/lib/stream/resync";
import { reconnectDelay, StreamSocket } from "@renderer/lib/stream/socket";
import { streamStatus } from "@renderer/lib/stream/status";

const PROBE_KEY = ["stream-reconnect-probe"];

const releaseTransport = streamTransport.borrow();

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
	socket.on("activity", "changed", () => {});
	await settle();

	return socket;
}

beforeEach(() => {
	streamTransport.reset();
	queryClient.clear();
});

afterEach(() => {
	streamStatus.set("open");
});

test("the backoff grows with every failed attempt and then holds at its cap", () => {
	expect([0, 1, 2, 3, 4, 5, 12].map(reconnectDelay)).toEqual([250, 500, 1000, 2000, 5000, 10_000, 10_000]);
});

test("a request still waiting when the socket drops rejects instead of hanging", async () => {
	const socket = await connected();
	const pending = socket.request("review", "watch", { projectId: "p1" });

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
	queryClient.setQueryData(PROBE_KEY, "seeded");
	await connected();

	expect(order).toEqual([]);

	streamTransport.disconnect();
	await backoff();

	expect(order).toEqual(["watch", "invalidate", "terminal"]);

	stopWatch();
	stopTerminal();
	stopCache();
});

test("a server announcing a different version stops the client instead of talking to it", async () => {
	const socket = await connected();
	streamTransport.version = "99.0.0";

	streamTransport.disconnect();
	await backoff();

	expect(streamStatus.get()).toBe("outdated");

	socket.send("activity", "unwatch", { projectId: "p1" });
	await settle();

	expect(streamTransport.payloads("activity", "unwatch")).toEqual([]);
});
