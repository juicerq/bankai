import { expect, test } from "bun:test";
import { TerminalMirror } from "@main/terminal/buffer/terminal-mirror";

const HOME = "\u001b[1;1H";

const FAR_RIGHT = "\u001b[100C";

test("what the shell wrote is in the snapshot the next attachment reads", async () => {
	const mirror = new TerminalMirror({ cols: 80, rows: 24 });

	mirror.write("listening on 4700");

	expect(await mirror.snapshot()).toInclude("listening on 4700");
});

test("output written in pieces comes back as one screen in the order it arrived", async () => {
	const mirror = new TerminalMirror({ cols: 80, rows: 24 });

	mirror.write("first ");
	mirror.write("second");

	expect(await mirror.snapshot()).toInclude("first second");
});

test("a snapshot waits for output that landed while it was already waiting", async () => {
	const mirror = new TerminalMirror({ cols: 80, rows: 24 });
	mirror.write("first ");

	const snapshotting = mirror.snapshot();
	mirror.write("second");

	expect(await snapshotting).toInclude("first second");
});

test("a snapshot carries the colors the shell painted", async () => {
	const mirror = new TerminalMirror({ cols: 80, rows: 24 });

	mirror.write("\u001b[31mred\u001b[0m plain");

	expect(await mirror.snapshot()).toBe("\u001b[31mred\u001b[0m plain");
});

test("a shell that has written nothing replays nothing", async () => {
	expect(await new TerminalMirror({ cols: 80, rows: 24 }).snapshot()).toBe("");
});

test("after a resize the mirror lays out what the shell writes at the new width", async () => {
	const mirror = new TerminalMirror({ cols: 40, rows: 24 });

	mirror.resize({ cols: 12, rows: 24 });
	mirror.write(`${HOME}${FAR_RIGHT}X`);

	expect(await mirror.snapshot()).toBe("\u001b[11CX");
});

test("a snapshot of a wrapped line comes back as one logical line, whatever the width", async () => {
	const narrow = new TerminalMirror({ cols: 20, rows: 4 });
	narrow.write(`${"A".repeat(25)}\r\nsecond\r\nthird\r\nfourth\r\nfifth`);

	const wide = new TerminalMirror({ cols: 60, rows: 4 });
	wide.write(`${"A".repeat(25)}\r\nsecond\r\nthird\r\nfourth\r\nfifth`);

	expect(await narrow.snapshot()).toBe(await wide.snapshot());
});
