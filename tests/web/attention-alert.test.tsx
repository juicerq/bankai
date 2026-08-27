import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { installDesktopAttention } from "@renderer/lib/attention-alert";
import { streamResync } from "@renderer/lib/stream/resync";
import type { BankaiDesktopApi } from "@shared/desktop";

const releaseTransport = streamTransport.borrow();
const raised: { reason: string; count: number }[] = [];
let stop: (() => void) | undefined;

afterAll(releaseTransport);

function bridge(api?: Partial<BankaiDesktopApi>) {
	Object.defineProperty(window, "bankaiDesktop", { configurable: true, value: api });
}

async function settle() {
	for (let tick = 0; tick < 4; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

beforeEach(() => {
	streamTransport.reset();
	raised.length = 0;
	bridge({ attention: (reason, count) => raised.push({ reason, count }) });
});

afterEach(() => {
	stop?.();
	stop = undefined;
	bridge();
});

test("an attention event from the stream reaches the desktop bridge", async () => {
	stop = installDesktopAttention();
	await settle();

	streamTransport.push("activity", "attention", { reason: "needs-attention", count: 2 });

	expect(raised).toEqual([{ reason: "needs-attention", count: 2 }]);
});

test("the client asks the server to announce attention", async () => {
	stop = installDesktopAttention();
	await settle();

	expect(streamTransport.payloads("activity", "watch-attention")).toHaveLength(1);
});

test("a resync re-asks the server to announce attention", async () => {
	stop = installDesktopAttention();
	await settle();
	streamTransport.reset();

	await streamResync.run();

	expect(streamTransport.payloads("activity", "watch-attention")).toHaveLength(1);
});

test("a browser without the desktop bridge never watches attention", async () => {
	bridge();

	stop = installDesktopAttention();
	await settle();

	expect(streamTransport.payloads("activity", "watch-attention")).toEqual([]);
});
