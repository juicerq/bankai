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
	| { type: "open-review" }
	| { type: "open-tab" }
	| { type: "close-tab" }
	| { type: "cycle-tab"; direction: -1 | 1 }
	| { type: "leader" }
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
	leader: "^X → s sidebar · r review · n new · d/x close · tab next · q quit",
} as const;

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
		case "r":
			return { type: "open-review" };
		case "n":
			return { type: "open-tab" };
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
