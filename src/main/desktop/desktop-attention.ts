import type { BrowserWindow } from "electron";
import { app, Notification } from "electron";

type AttentionWindow = Pick<BrowserWindow, "flashFrame" | "isDestroyed" | "isFocused"> & {
	show: () => void;
	focus: () => void;
	on: (event: "focus", listener: () => void) => unknown;
};

type AttentionReason = "needs-attention" | "done";

const ATTENTION_TEXT: Record<AttentionReason, { one: string; many: string }> = {
	"needs-attention": { one: "session needs attention", many: "sessions need attention" },
	done: { one: "session is done", many: "sessions are done" },
};

let mainWindow: AttentionWindow | undefined;

function setupDesktopAttention(win: AttentionWindow): void {
	mainWindow = win;
	win.on("focus", () => win.flashFrame(false));
}

function attentionBody(reason: AttentionReason, count: number): string {
	const text = ATTENTION_TEXT[reason];

	return `${count} ${count === 1 ? text.one : text.many}`;
}

function notifyDesktop(win: AttentionWindow, reason: AttentionReason, count: number): void {
	if (!Notification.isSupported()) {
		return;
	}

	const notification = new Notification({
		title: app.name,
		body: attentionBody(reason, count),
	});
	notification.on("click", () => {
		win.show();
		win.focus();
	});
	notification.show();
}

function requestDesktopAttention(reason: AttentionReason, count: number): void {
	const win = mainWindow;
	if (!win || win.isDestroyed() || win.isFocused() || count < 1) {
		return;
	}

	win.flashFrame(true);
	notifyDesktop(win, reason, count);
}

export const DesktopAttention = {
	setup: setupDesktopAttention,
	request: requestDesktopAttention,
};
