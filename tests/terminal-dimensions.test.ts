import { describe, expect, it } from "bun:test";
import {
	TERMINAL_MAX_COLUMNS,
	TERMINAL_MAX_ROWS,
	terminalColumnsSchema,
	terminalRowsSchema,
} from "@main/terminal/terminal-dimensions";

describe("terminal dimensions", () => {
	it("accepts the practical node-pty boundaries", () => {
		expect(terminalColumnsSchema.assert(TERMINAL_MAX_COLUMNS)).toBe(TERMINAL_MAX_COLUMNS);
		expect(terminalRowsSchema.assert(TERMINAL_MAX_ROWS)).toBe(TERMINAL_MAX_ROWS);
	});

	it("rejects dimensions over their separate boundaries", () => {
		expect(() => terminalColumnsSchema.assert(TERMINAL_MAX_COLUMNS + 1)).toThrow();
		expect(() => terminalRowsSchema.assert(TERMINAL_MAX_ROWS + 1)).toThrow();
	});

	it("rejects non-positive, non-integer, and non-finite dimensions", () => {
		for (const value of [0, -1, 1.5, Infinity, Number.NaN]) {
			expect(() => terminalColumnsSchema.assert(value)).toThrow();
			expect(() => terminalRowsSchema.assert(value)).toThrow();
		}
	});
});
