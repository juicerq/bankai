import { describe, expect, it } from "bun:test";
import { TerminalInput } from "@main/terminal/terminal-input";

describe("turning a phone's intention into terminal bytes", () => {
	it("wraps a multiline prompt so the TUI takes it as one message", () => {
		expect(TerminalInput.bracketedPaste("primeira\nsegunda")).toBe("\x1b[200~primeira\nsegunda\x1b[201~");
	});

	it("sends escape as the byte that interrupts a busy turn", () => {
		expect(TerminalInput.TERMINAL_KEY_BYTES.escape).toBe("\x1b");
	});

	it("answers a dialog with the digit that selects and confirms in one stroke", () => {
		expect([TerminalInput.TERMINAL_KEY_BYTES["1"], TerminalInput.TERMINAL_KEY_BYTES["2"], TerminalInput.TERMINAL_KEY_BYTES["3"]]).toEqual(["1", "2", "3"]);
	});

	it("moves a selection with the arrows the TUI reads and confirms with a carriage return", () => {
		expect(TerminalInput.TERMINAL_KEY_BYTES.up).toBe("\x1b[A");
		expect(TerminalInput.TERMINAL_KEY_BYTES.down).toBe("\x1b[B");
		expect(TerminalInput.TERMINAL_KEY_BYTES.enter).toBe("\r");
	});

	it("names every key it can translate, so the schema and the table cannot drift", () => {
		expect(TerminalInput.TERMINAL_KEYS.map((key) => TerminalInput.TERMINAL_KEY_BYTES[key]).every((bytes) => !!bytes)).toBe(true);
	});
});
