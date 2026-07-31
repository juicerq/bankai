import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { requestDesktopAttention, setupDesktopAttention } from "@main/window/attention";

class AttentionWindow extends EventEmitter {
	readonly flashes: boolean[] = [];
	flashFrame = this.flashes.push.bind(this.flashes);
	isDestroyed = () => false;
	isFocused = () => false;
}

describe("desktop attention", () => {
	test("an unfocused window asks the taskbar for attention", () => {
		const win = new AttentionWindow();
		setupDesktopAttention(win);

		requestDesktopAttention();

		expect(win.flashes).toEqual([true]);
	});

	test("the focused window does not ask for attention", () => {
		const win = new AttentionWindow();
		win.isFocused = () => true;
		setupDesktopAttention(win);

		requestDesktopAttention();

		expect(win.flashes).toEqual([]);
	});

	test("focusing the window clears its attention request", () => {
		const win = new AttentionWindow();
		setupDesktopAttention(win);
		requestDesktopAttention();

		win.emit("focus");

		expect(win.flashes).toEqual([true, false]);
	});

	test("a destroyed window ignores a late request", () => {
		const win = new AttentionWindow();
		win.isDestroyed = () => true;
		setupDesktopAttention(win);

		requestDesktopAttention();

		expect(win.flashes).toEqual([]);
	});
});
