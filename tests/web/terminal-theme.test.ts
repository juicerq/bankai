import "./orpc-transport";
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ITerminalOptions } from "@xterm/xterm";
import { Theme } from "@renderer/lib/theme";
import { registerTerminalStyle } from "@renderer/routes/-utils/terminal-style";
import { THEME_LIGHT_CLASS } from "@shared/theme";

const STYLES_PATH = new URL("../../src/renderer/src/styles.css", import.meta.url);

function block(css: string, selector: string): string {
	const found = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1];

	if (!found) {
		throw new Error(`No ${selector} block in the stylesheet`);
	}

	return found;
}

function token(declarations: string, name: string): string {
	const value = new RegExp(`${name}:\\s*([^;]+);`).exec(declarations)?.[1];

	if (!value) {
		throw new Error(`No ${name} among the declarations`);
	}

	return value.trim();
}

let dark: string;
let light: string;

beforeAll(async () => {
	const css = await Bun.file(STYLES_PATH).text();
	const rootTokens = block(css, "@theme static");
	const lightTokens = block(css, "html\\.theme-light");

	dark = token(rootTokens, "--color-terminal-background");
	light = token(lightTokens, "--color-terminal-background");

	const style = document.createElement("style");
	style.textContent = `:root {${rootTokens}} html.${THEME_LIGHT_CLASS} {${lightTokens}}`;
	document.head.append(style);

	Theme.set("dark");
});

afterAll(() => {
	Theme.set("dark");
});

test("a live terminal takes the new palette without being recreated", () => {
	const terminal: { options: ITerminalOptions } = { options: {} };
	const stop = registerTerminalStyle(terminal);

	expect(terminal.options.theme?.background).toBe(dark);

	Theme.set("light");

	expect(terminal.options.theme?.background).toBe(light);

	Theme.set("dark");

	expect(terminal.options.theme?.background).toBe(dark);

	stop();
});

test("a disposed terminal is left alone by later theme changes", () => {
	const terminal: { options: ITerminalOptions } = { options: {} };
	const stop = registerTerminalStyle(terminal);

	stop();
	Theme.set("light");

	expect(terminal.options.theme?.background).toBe(dark);
});
