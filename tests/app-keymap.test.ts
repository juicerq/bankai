import { describe, expect, it } from "vitest";
import { commandKey, leaderCommand, panelCommand, RESIZE_STEP, resizeCommand } from "@ui/-utils/app-keymap";

const key = {
	name: "",
	raw: "",
	ctrl: false,
	shift: false,
	option: false,
	meta: false,
};

describe("app keymap", () => {
	it("maps the leader chord and leader commands", () => {
		expect(commandKey({ ...key, name: "x", raw: "\u0018", ctrl: true }, true))
			.toEqual({ type: "leader" });
		expect(leaderCommand({ ...key, name: "r" }))
			.toEqual({ type: "open-review" });
		expect(leaderCommand({ ...key, name: "v" }))
			.toEqual({ type: "toggle-split" });
		expect(leaderCommand({ ...key, name: "x" }))
			.toEqual({ type: "close-tab" });
		expect(leaderCommand({ ...key, name: "q" }))
			.toEqual({ type: "quit" });
		expect(leaderCommand({ ...key, name: "f" }))
			.toEqual({ type: "toggle-zen" });
		expect(leaderCommand({ ...key, name: "n" }))
			.toEqual({ type: "open-tab" });
		expect(leaderCommand({ ...key, name: "x", raw: "\u0018", ctrl: true }))
			.toEqual({ type: "input", raw: "\u0018" });
		expect(leaderCommand({ ...key, name: "o" }))
			.toEqual({ type: "focus-panel" });
		expect(leaderCommand({ ...key, name: "=" }))
			.toEqual({ type: "enter-resize" });
		expect(leaderCommand({ ...key, name: "unknown" })).toBeNull();
	});

	it("steps and exits the resize mode, capturing every other key", () => {
		expect(resizeCommand({ ...key, name: "left" })).toEqual({ type: "resize-step", delta: -RESIZE_STEP });
		expect(resizeCommand({ ...key, name: "h" })).toEqual({ type: "resize-step", delta: -RESIZE_STEP });
		expect(resizeCommand({ ...key, name: "right" })).toEqual({ type: "resize-step", delta: RESIZE_STEP });
		expect(resizeCommand({ ...key, name: "l" })).toEqual({ type: "resize-step", delta: RESIZE_STEP });
		expect(resizeCommand({ ...key, name: "escape" })).toEqual({ type: "resize-exit" });
		expect(resizeCommand({ ...key, name: "return" })).toEqual({ type: "resize-exit" });
		expect(resizeCommand({ ...key, name: "a" })).toBeNull();
	});

	it("maps panel keys and leaves scroll keys for the scrollbox", () => {
		expect(panelCommand({ ...key, name: "escape" })).toEqual({ type: "blur" });
		expect(panelCommand({ ...key, name: "tab" })).toEqual({ type: "cycle-scope" });
		expect(panelCommand({ ...key, name: "d" })).toEqual({ type: "toggle-unified" });
		expect(panelCommand({ ...key, name: "s" })).toEqual({ type: "toggle-folded" });
		expect(panelCommand({ ...key, name: "up" })).toBeNull();
		expect(panelCommand({ ...key, name: "down" })).toBeNull();
		expect(panelCommand({ ...key, name: "j" })).toBeNull();
		expect(panelCommand({ ...key, name: "k" })).toBeNull();
	});

	it("gives terminal input precedence over navigation keys", () => {
		expect(commandKey({ ...key, name: "j", raw: "j" }, true))
			.toEqual({ type: "input", raw: "j" });
	});

	it("maps project and tab number shortcuts", () => {
		expect(commandKey({ ...key, name: "3", raw: "3", ctrl: true }, false))
			.toEqual({ type: "select-project", index: 2 });
		expect(commandKey({ ...key, name: "2", raw: "2", option: true }, false))
			.toEqual({ type: "select-tab", index: 1 });
	});

	it("distinguishes project movement from project selection", () => {
		expect(commandKey({ ...key, name: "up", shift: true }, false))
			.toEqual({ type: "move-project", direction: "up" });
		expect(commandKey({ ...key, name: "up" }, false))
			.toEqual({ type: "select-project-offset", direction: -1 });
	});
});
