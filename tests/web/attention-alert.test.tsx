import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { AttentionAlert } from "@renderer/lib/attention-alert";
import { streamResync } from "@renderer/lib/stream/resync";
import type { BankaiDesktopApi } from "@shared/desktop";

const releaseTransport = streamTransport.borrow();
const raised: { reason: string; count: number }[] = [];
const played: number[] = [];
const peaks: number[] = [];
let stop: (() => void) | undefined;

afterAll(releaseTransport);

function bridge(api?: Partial<BankaiDesktopApi>) {
	Object.defineProperty(window, "bankaiDesktop", { configurable: true, value: api });
}

function stubAudio() {
	function oscillator() {
		const node = {
			frequency: { value: 0 },
			connect: (target: unknown) => target,
			start: () => played.push(node.frequency.value),
			stop: () => {},
		};

		return node;
	}

	class StubAudioContext {
		currentTime = 0;
		state = "running";
		destination = {};
		resume = async () => {};
		createOscillator = oscillator;
		createGain = () => ({
			gain: {
				setValueAtTime: () => {},
				linearRampToValueAtTime: (value: number) => peaks.push(value),
				exponentialRampToValueAtTime: () => {},
			},
			connect: (target: unknown) => target,
		});
	}

	Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: StubAudioContext });
}

async function settle() {
	for (let tick = 0; tick < 4; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

beforeEach(() => {
	streamTransport.reset();
	raised.length = 0;
	played.length = 0;
	peaks.length = 0;
	stubAudio();
	bridge({ attention: (reason, count) => raised.push({ reason, count }) });
});

afterEach(() => {
	stop?.();
	stop = undefined;
	bridge();
});

test("an attention event from the stream reaches the desktop bridge", async () => {
	stop = AttentionAlert.install();
	await settle();

	streamTransport.push("activity", "attention", { reason: "needs-attention", count: 2 });

	expect(raised).toEqual([{ reason: "needs-attention", count: 2 }]);
});

test("a done event plays the chime", async () => {
	stop = AttentionAlert.install();
	await settle();

	streamTransport.push("activity", "attention", { reason: "done", count: 1 });
	await settle();

	expect(played).toEqual([660, 880]);
	expect(peaks).toEqual([0.1215, 0.1215]);
});

test("an attention event that is not done stays silent", async () => {
	stop = AttentionAlert.install();
	await settle();

	streamTransport.push("activity", "attention", { reason: "needs-attention", count: 1 });
	await settle();

	expect(played).toEqual([]);
});

test("a browser without the desktop bridge still plays the chime", async () => {
	bridge();

	stop = AttentionAlert.install();
	await settle();

	streamTransport.push("activity", "attention", { reason: "done", count: 1 });
	await settle();

	expect(played).toEqual([660, 880]);
});

test("the client asks the server to announce attention", async () => {
	stop = AttentionAlert.install();
	await settle();

	expect(streamTransport.payloads("activity", "watch-attention")).toHaveLength(1);
});

test("a resync re-asks the server to announce attention", async () => {
	stop = AttentionAlert.install();
	await settle();
	streamTransport.reset();

	await streamResync.run();

	expect(streamTransport.payloads("activity", "watch-attention")).toHaveLength(1);
});
