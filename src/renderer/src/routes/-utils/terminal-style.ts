import type { ITerminalOptions } from "@xterm/xterm";

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
			background: color("surface-sunken"),
			foreground: color("primary"),
			cursor: color("tertiary"),
			cursorAccent: color("surface-sunken"),
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
