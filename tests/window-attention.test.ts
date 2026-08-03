import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { DesktopAttention } from "@main/desktop/desktop-attention";

class AttentionWindow extends EventEmitter {
	readonly flashes: boolean[] = [];
	flashFrame = this.flashes.push.bind(this.flashes);
	isDestroyed = () => false;
	isFocused = () => false;
}

describe("desktop attention", () => {
	test("an unfocused window asks the taskbar for attention", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);

		DesktopAttention.request();

		expect(win.flashes).toEqual([true]);
	});

	test("the focused window does not ask for attention", () => {
		const win = new AttentionWindow();
		win.isFocused = () => true;
		DesktopAttention.setup(win);

		DesktopAttention.request();

		expect(win.flashes).toEqual([]);
	});

	test("focusing the window clears its attention request", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);
		DesktopAttention.request();

		win.emit("focus");

		expect(win.flashes).toEqual([true, false]);
	});

	test("a destroyed window ignores a late request", () => {
		const win = new AttentionWindow();
		win.isDestroyed = () => true;
		DesktopAttention.setup(win);

		DesktopAttention.request();

		expect(win.flashes).toEqual([]);
	});
});
