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

	expect(ring.read()).toBe("newest");
});

test("a write larger than the cap is kept whole rather than cut", () => {
	const ring = new TerminalRingBuffer();

	ring.append(`${"x".repeat(TERMINAL_RING_BYTES)}tail`);

	expect(ring.read().length).toBe(TERMINAL_RING_BYTES + "tail".length);
});

test("trimming never cuts a character in half", () => {
	const ring = new TerminalRingBuffer();
	const chunk = "é".repeat(1024);

	for (let written = 0; written <= TERMINAL_RING_BYTES; written += chunk.length * 2) {
		ring.append(chunk);
	}

	const replay = ring.read();
	expect(replay).not.toInclude("�");
	expect(Buffer.byteLength(replay)).toBeLessThanOrEqual(TERMINAL_RING_BYTES + chunk.length * 2);
});
