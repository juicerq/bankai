import { expect, test } from "bun:test";
import { TERMINAL_RING_BYTES, TerminalRingBuffer } from "@main/terminal/TerminalRingBuffer";

test("everything written back so far is replayed in order", () => {
	const ring = new TerminalRingBuffer();

	ring.append("first ");
	ring.append("second");

	expect(ring.read()).toBe("first second");
});

test("an empty ring replays nothing", () => {
	expect(new TerminalRingBuffer().read()).toBe("");
});

test("scrollback beyond the cap drops from the oldest end", () => {
	const ring = new TerminalRingBuffer();
	ring.append("x".repeat(TERMINAL_RING_BYTES));

	ring.append("newest");

	const replay = ring.read();
	expect(replay.length).toBe(TERMINAL_RING_BYTES);
	expect(replay.endsWith("newest")).toBe(true);
});

test("a single write larger than the cap keeps only its tail", () => {
	const ring = new TerminalRingBuffer();

	ring.append(`${"x".repeat(TERMINAL_RING_BYTES)}tail`);

	const replay = ring.read();
	expect(replay.length).toBe(TERMINAL_RING_BYTES);
	expect(replay.endsWith("tail")).toBe(true);
});

test("the cap counts bytes, not characters", () => {
	const ring = new TerminalRingBuffer();

	ring.append("é".repeat(TERMINAL_RING_BYTES));

	expect(ring.read().length).toBeLessThan(TERMINAL_RING_BYTES);
});
