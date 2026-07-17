import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import {
	terminalMouseEncoding,
	terminalWheelSequence,
} from "@core/terminal/terminalMouse";

function write(screen: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => {
		screen.write(data, resolve);
	});
}

describe("terminalWheelSequence", () => {
	it("encodes SGR wheel input", () => {
		expect(terminalWheelSequence("sgr", 64, 3, 4)).toBe("\u001B[<64;3;4M");
	});

	it("encodes legacy X10 wheel input", () => {
		expect(terminalWheelSequence("x10", 64, 3, 4)).toBe(
			`\u001B[M${String.fromCodePoint(96, 35, 36)}`,
		);
	});

	it("reads the active mouse encoding from xterm", async () => {
		const screen = new Terminal({ allowProposedApi: true });
		expect(terminalMouseEncoding(screen)).toBe("x10");

		await write(screen, "\u001B[?1006h");
		expect(terminalMouseEncoding(screen)).toBe("sgr");

		await write(screen, "\u001B[?1016h");
		expect(terminalMouseEncoding(screen)).toBe("sgr");
		screen.dispose();
	});
});
