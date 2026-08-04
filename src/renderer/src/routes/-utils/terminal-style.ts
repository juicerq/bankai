import type { ITerminalOptions } from "@xterm/xterm";

export const TERMINAL_OPTIONS = {
	allowProposedApi: false,
	convertEol: true,
	cursorBlink: true,
	cursorStyle: "bar",
	fontSize: 14,
	fontWeight: "400",
	fontWeightBold: "600",
	lineHeight: 1.35,
	scrollback: 10_000,
} satisfies ITerminalOptions;

export function readTerminalStyle(): Pick<ITerminalOptions, "fontFamily" | "theme"> {
	const styles = getComputedStyle(document.documentElement);

	const token = (name: string) => {
		const value = styles.getPropertyValue(name).trim();
		if (!value) {
			throw new Error(`Missing design token ${name}`);
		}
		return value;
	};

	const color = (name: string) => token(`--color-${name}`);

	return {
		fontFamily: token("--font-mono"),
		theme: {
			background: color("terminal-background"),
			foreground: color("primary"),
			cursor: color("tertiary"),
			cursorAccent: color("terminal-background"),
			selectionBackground: color("terminal-selection"),
			black: color("terminal-black"),
			red: color("removed"),
			green: color("added"),
			yellow: color("tertiary"),
			blue: color("terminal-blue"),
			magenta: color("terminal-magenta"),
			cyan: color("terminal-cyan"),
			white: color("terminal-white"),
			brightBlack: color("terminal-bright-black"),
			brightRed: color("terminal-bright-red"),
			brightGreen: color("terminal-bright-green"),
			brightYellow: color("terminal-bright-yellow"),
			brightBlue: color("terminal-bright-blue"),
			brightMagenta: color("terminal-bright-magenta"),
			brightCyan: color("terminal-bright-cyan"),
			brightWhite: color("primary"),
		},
	};
}
