type KeyInput = {
	name: string;
	raw: string;
	ctrl: boolean;
	shift: boolean;
	option: boolean;
	meta: boolean;
};

export type AppCommand =
	| { type: "toggle-zen" }
	| { type: "quit" }
	| { type: "input"; raw: string }
	| { type: "focus-sidebar" }
	| { type: "focus-panel" }
	| { type: "open-review" }
	| { type: "toggle-split" }
	| { type: "enter-resize" }
	| { type: "open-tab" }
	| { type: "close-tab" }
	| { type: "cycle-tab"; direction: -1 | 1 }
	| { type: "leader" }
	| { type: "open-settings" }
	| { type: "select-project"; index: number }
	| { type: "select-tab"; index: number }
	| { type: "move-project"; direction: "up" | "down" }
	| { type: "select-project-offset"; direction: -1 | 1 }
	| { type: "enter-terminal" }
	| { type: "open-picker" }
	| { type: "rename-project" }
	| { type: "remove-project" };

export const APP_KEY_HINTS = {
	terminal: "^X → commands · ^1-9 project · ⌥1-9 tab · drag select",
	idle: "⏎ focus shell · n new · x close · ^1-9/↑↓ project · ⌥1-9 tab · ^X commands",
	empty: "n new shell · ^1-9/↑↓ project · a add",
	leader: "^X → s sidebar · o panel · r review · v split · = resize · n new · d/x close · tab next · p settings · q quit",
	resize: "resize · ←→/hl move divider · esc/⏎ done",
} as const;

export const RESIZE_STEP = 0.05;

export type ResizeCommand =
	| { type: "resize-step"; delta: number }
	| { type: "resize-exit" };

export function resizeCommand(key: KeyInput): ResizeCommand | null {
	switch (key.name) {
		case "escape":
		case "return":
			return { type: "resize-exit" };
		case "left":
		case "h":
			return { type: "resize-step", delta: -RESIZE_STEP };
		case "right":
		case "l":
			return { type: "resize-step", delta: RESIZE_STEP };
		default:
			return null;
	}
}

export type PanelCommand =
	| { type: "cycle-scope" }
	| { type: "toggle-unified" }
	| { type: "toggle-folded" }
	| { type: "blur" };

export function panelCommand(key: KeyInput): PanelCommand | null {
	switch (key.name) {
		case "escape":
			return { type: "blur" };
		case "tab":
			return { type: "cycle-scope" };
		case "d":
			return { type: "toggle-unified" };
		case "s":
			return { type: "toggle-folded" };
		default:
			return null;
	}
}

function numberIndex(key: KeyInput): number | null {
	if (key.name.length !== 1 || key.name < "1" || key.name > "9") {
		return null;
	}

	return Number(key.name) - 1;
}

export function leaderCommand(key: KeyInput): AppCommand | null {
	if (key.name === "f") {
		return { type: "toggle-zen" };
	}
	if (key.name === "q") {
		return { type: "quit" };
	}
	if (key.ctrl && key.name === "x") {
		return { type: "input", raw: key.raw };
	}

	switch (key.name) {
		case "s":
			return { type: "focus-sidebar" };
		case "o":
			return { type: "focus-panel" };
		case "r":
			return { type: "open-review" };
		case "v":
			return { type: "toggle-split" };
		case "=":
			return { type: "enter-resize" };
		case "n":
			return { type: "open-tab" };
		case "p":
			return { type: "open-settings" };
		case "d":
		case "x":
			return { type: "close-tab" };
		case "left":
			return { type: "cycle-tab", direction: -1 };
		case "right":
		case "tab":
			return { type: "cycle-tab", direction: 1 };
		default:
			return null;
	}
}

export function commandKey(key: KeyInput, terminalFocused: boolean): AppCommand | null {
	if (key.ctrl && key.name === "x") {
		return { type: "leader" };
	}

	const index = numberIndex(key);
	if (index !== null && key.ctrl) {
		return { type: "select-project", index };
	}
	if (index !== null && (key.option || key.meta)) {
		return { type: "select-tab", index };
	}
	if (terminalFocused) {
		return { type: "input", raw: key.raw };
	}

	switch (key.name) {
		case "up":
		case "k":
			return key.shift
				? { type: "move-project", direction: "up" }
				: { type: "select-project-offset", direction: -1 };
		case "down":
		case "j":
			return key.shift
				? { type: "move-project", direction: "down" }
				: { type: "select-project-offset", direction: 1 };
		case "return":
		case "right":
		case "l":
			return { type: "enter-terminal" };
		case "n":
			return { type: "open-tab" };
		case "x":
			return { type: "close-tab" };
		case "a":
			return { type: "open-picker" };
		case "r":
			return { type: "rename-project" };
		case "d":
			return { type: "remove-project" };
		default:
			return null;
	}
}
