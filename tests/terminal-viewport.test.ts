import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { TerminalViewport } from "@core/terminal/TerminalViewport";

function write(screen: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => {
		screen.write(data, resolve);
	});
}

describe("TerminalViewport", () => {
	it("keeps the same history visible while output grows", async () => {
		const screen = new Terminal({ cols: 8, rows: 2, scrollback: 20, allowProposedApi: true });
		await write(screen, "one\r\ntwo\r\nthree");
		const viewport = new TerminalViewport();
		viewport.attach(screen.buffer.active);
		viewport.scroll(screen.buffer.active, "up", 1);
		const top = viewport.top(screen.buffer.active);

		await write(screen, "\r\nfour");
		viewport.onWrite(screen.buffer.active);

		expect(viewport.top(screen.buffer.active)).toBe(top);
		expect(viewport.snapToLive()).toBe(true);
		expect(viewport.top(screen.buffer.active)).toBe(screen.buffer.active.baseY);
		screen.dispose();
	});

	it("does not scroll the alternate screen", async () => {
		const screen = new Terminal({ cols: 8, rows: 2, allowProposedApi: true });
		await write(screen, "\u001B[?1049h");
		const viewport = new TerminalViewport();

		expect(viewport.scroll(screen.buffer.active, "up", 1)).toBe(false);
		screen.dispose();
	});
});
