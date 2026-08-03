import { describe, expect, it } from "bun:test";
import { bracketedPaste, TERMINAL_KEY_BYTES, TERMINAL_KEYS } from "@main/terminal/terminal-input";

describe("turning a phone's intention into terminal bytes", () => {
	it("wraps a multiline prompt so the TUI takes it as one message", () => {
		expect(bracketedPaste("primeira\nsegunda")).toBe("\x1b[200~primeira\nsegunda\x1b[201~");
	});

	it("sends escape as the byte that interrupts a busy turn", () => {
		expect(TERMINAL_KEY_BYTES.escape).toBe("\x1b");
	});

	it("answers a dialog with the digit that selects and confirms in one stroke", () => {
		expect([TERMINAL_KEY_BYTES["1"], TERMINAL_KEY_BYTES["2"], TERMINAL_KEY_BYTES["3"]]).toEqual(["1", "2", "3"]);
	});

	it("moves a selection with the arrows the TUI reads and confirms with a carriage return", () => {
		expect(TERMINAL_KEY_BYTES.up).toBe("\x1b[A");
		expect(TERMINAL_KEY_BYTES.down).toBe("\x1b[B");
		expect(TERMINAL_KEY_BYTES.enter).toBe("\r");
	});

	it("names every key it can translate, so the schema and the table cannot drift", () => {
		expect(TERMINAL_KEYS.map((key) => TERMINAL_KEY_BYTES[key]).every((bytes) => !!bytes)).toBe(true);
	});
});
