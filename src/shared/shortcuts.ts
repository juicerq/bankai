import type { SessionPageShortcut } from "@shared/session-page";

export interface ShortcutStroke {
	type: string;
	key: string;
	code: string;
	control: boolean;
	alt: boolean;
	meta: boolean;
	shift: boolean;
}

type ShortcutInterpretation =
	| { kind: "leader" }
	| { kind: "shortcut"; shortcut: SessionPageShortcut };

type ShortcutResolver = (input: ShortcutStroke) => ShortcutInterpretation;

const shortcut = (value: SessionPageShortcut): ShortcutInterpretation => ({ kind: "shortcut", shortcut: value });

const LEADER_SHORTCUTS: Record<string, ShortcutResolver> = {
	KeyR: () => shortcut({ action: "toggle-review" }),
	KeyE: () => shortcut({ action: "toggle-expanded" }),
	KeyG: () => shortcut({ action: "toggle-page" }),
	KeyL: () => shortcut({ action: "toggle-todos" }),
	KeyC: () => shortcut({ action: "open-commands" }),
	Comma: () => shortcut({ action: "open-settings" }),
	KeyP: () => shortcut({ action: "open-quick-open" }),
	KeyF: () => shortcut({ action: "toggle-fullscreen" }),
	KeyX: () => shortcut({ action: "archive-shell" }),
	KeyT: (input) => shortcut({ action: "new-shell", plain: input.shift }),
};

const DIRECT_SHORTCUTS: Record<string, ShortcutInterpretation> = {
	"1:KeyX": { kind: "leader" },
	"1:Tab": shortcut({ action: "jump-waiting" }),
	"2:Digit1": shortcut({ action: "jump-row", index: 0 }),
	"2:Digit2": shortcut({ action: "jump-row", index: 1 }),
	"2:Digit3": shortcut({ action: "jump-row", index: 2 }),
	"2:Digit4": shortcut({ action: "jump-row", index: 3 }),
	"2:Digit5": shortcut({ action: "jump-row", index: 4 }),
	"2:Digit6": shortcut({ action: "jump-row", index: 5 }),
	"2:Digit7": shortcut({ action: "jump-row", index: 6 }),
	"2:Digit8": shortcut({ action: "jump-row", index: 7 }),
	"2:Digit9": shortcut({ action: "jump-row", index: 8 }),
};

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export class ShortcutInterpreter {
	private leaderArmed = false;

	readonly reset = (): void => {
		this.leaderArmed = false;
	};

	accept(input: ShortcutStroke): ShortcutInterpretation | undefined {
		if (input.type !== "keyDown" || MODIFIER_KEYS.has(input.key)) {
			return;
		}

		if (this.leaderArmed) {
			this.leaderArmed = false;
			const resolve = LEADER_SHORTCUTS[input.code];

			if (!resolve) {
				return;
			}

			return resolve(input);
		}

		const modifiers = Number(input.control) | (Number(input.alt) << 1) | (Number(input.meta) << 2);
		const resolved = DIRECT_SHORTCUTS[`${modifiers}:${input.code}`];

		if (resolved?.kind === "leader") {
			this.leaderArmed = true;
		}

		return resolved;
	}
}
