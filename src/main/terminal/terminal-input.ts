const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

const TERMINAL_KEYS = ["1", "2", "3", "up", "down", "enter", "escape"] as const;

export type TerminalKey = (typeof TERMINAL_KEYS)[number];

const TERMINAL_KEY_BYTES: Record<TerminalKey, string> = {
	"1": "1",
	"2": "2",
	"3": "3",
	up: "\x1b[A",
	down: "\x1b[B",
	enter: "\r",
	escape: "\x1b",
};

function bracketedPaste(text: string): string {
	return `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`;
}

export const TerminalInput = {
	TERMINAL_KEYS,
	TERMINAL_KEY_BYTES,
	bracketedPaste,
};
