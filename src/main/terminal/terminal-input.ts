const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

export const TERMINAL_KEYS = ["1", "2", "3", "up", "down", "enter", "escape"] as const;

export type TerminalKey = (typeof TERMINAL_KEYS)[number];

export const TERMINAL_KEY_BYTES: Record<TerminalKey, string> = {
	"1": "1",
	"2": "2",
	"3": "3",
	up: "\x1b[A",
	down: "\x1b[B",
	enter: "\r",
	escape: "\x1b",
};

export function bracketedPaste(text: string): string {
	return `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`;
}
