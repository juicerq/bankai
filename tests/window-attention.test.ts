import { beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { DesktopAttention } from "@main/desktop/desktop-attention";
import { FakeNotification, notifications } from "./utils/electron-mock";

class AttentionWindow extends EventEmitter {
	readonly flashes: boolean[] = [];
	shown = 0;
	focused = 0;
	flashFrame = this.flashes.push.bind(this.flashes);
	isDestroyed = () => false;
	isFocused = () => false;
	show = () => {
		this.shown += 1;
	};
	focus = () => {
		this.focused += 1;
	};
}

describe("desktop attention", () => {
	beforeEach(() => {
		notifications.length = 0;
		FakeNotification.isSupported = () => true;
	});

	test("an unfocused window asks the taskbar for attention", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);

		DesktopAttention.request("needs-attention", 1);

		expect(win.flashes).toEqual([true]);
	});

	test("the focused window does not ask for attention", () => {
		const win = new AttentionWindow();
		win.isFocused = () => true;
		DesktopAttention.setup(win);

		DesktopAttention.request("done", 1);

		expect(win.flashes).toEqual([]);
		expect(notifications).toEqual([]);
	});

	test("focusing the window clears its attention request", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);
		DesktopAttention.request("done", 1);

		win.emit("focus");

		expect(win.flashes).toEqual([true, false]);
	});

	test("a destroyed window ignores a late request", () => {
		const win = new AttentionWindow();
		win.isDestroyed = () => true;
		DesktopAttention.setup(win);

		DesktopAttention.request("done", 1);

		expect(win.flashes).toEqual([]);
	});

	test("a finished session raises a desktop notification", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);

		DesktopAttention.request("done", 1);

		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.options).toEqual({ title: "Bankai", body: "1 session is done" });
		expect(notifications[0]?.shown).toBe(1);
	});

	test("many finished sessions read as plural", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);

		DesktopAttention.request("done", 3);

		expect(notifications[0]?.options.body).toBe("3 sessions are done");
	});

	test("waiting sessions name their own reason", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);

		DesktopAttention.request("needs-attention", 2);

		expect(notifications[0]?.options.body).toBe("2 sessions need attention");
	});

	test("clicking the notification brings the window back", () => {
		const win = new AttentionWindow();
		DesktopAttention.setup(win);
		DesktopAttention.request("done", 1);

		notifications[0]?.emit("click");

		expect(win.shown).toBe(1);
		expect(win.focused).toBe(1);
	});

	test("a desktop without notifications still flashes", () => {
		const win = new AttentionWindow();
		FakeNotification.isSupported = () => false;
		DesktopAttention.setup(win);

		DesktopAttention.request("done", 1);

		expect(win.flashes).toEqual([true]);
		expect(notifications).toEqual([]);
	});
});
