import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { TerminalSelection } from "@core/terminal/TerminalSelection";

function write(screen: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => {
		screen.write(data, resolve);
	});
}

describe("TerminalSelection", () => {
	it("normalizes a reverse drag and copies multiple lines", async () => {
		const screen = new Terminal({ cols: 8, rows: 3, allowProposedApi: true });
		await write(screen, "alpha\r\nbeta");
		const selection = new TerminalSelection();
		const bounds = { x: 10, y: 5, width: 8, height: 3, top: 0 };

		selection.start({ x: 13, y: 6 }, bounds);
		expect(selection.drag({ x: 11, y: 5 }, bounds)).toBe(true);

		expect(selection.contains(0, 1)).toBe(true);
		expect(selection.contains(1, 3)).toBe(true);
		expect(selection.finish(screen.buffer.active)).toBe("lpha\nbeta");
		screen.dispose();
	});

	it("clamps selection to the visible grid", async () => {
		const screen = new Terminal({ cols: 4, rows: 1, allowProposedApi: true });
		await write(screen, "text");
		const selection = new TerminalSelection();
		const bounds = { x: 2, y: 2, width: 4, height: 1, top: 0 };

		selection.start({ x: -10, y: -10 }, bounds);
		selection.drag({ x: 99, y: 99 }, bounds);

		expect(selection.finish(screen.buffer.active)).toBe("text");
		screen.dispose();
	});
});
