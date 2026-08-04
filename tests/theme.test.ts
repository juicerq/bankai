import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { resolveTheme, THEME_ARGUMENTS, THEME_BACKGROUND, themeFromArguments } from "@shared/theme";

const STYLES_PATH = join(import.meta.dirname, "../src/renderer/src/styles.css");

function surfaceUnder(css: string, selector: string): string {
	const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
	const surface = block && /--color-surface:\s*([^;]+);/.exec(block)?.[1];

	if (!surface) {
		throw new Error(`No --color-surface under ${selector}`);
	}

	return surface.trim();
}

describe("theme resolution", () => {
	it("keeps an explicit choice without asking the system about it", () => {
		let asked = 0;
		const systemDark = () => {
			asked += 1;
			return true;
		};

		expect(resolveTheme("dark", systemDark)).toBe("dark");
		expect(resolveTheme("light", systemDark)).toBe("light");
		expect(asked).toBe(0);
	});

	it("takes the system answer when the choice is system", () => {
		expect(resolveTheme("system", () => true)).toBe("dark");
		expect(resolveTheme("system", () => false)).toBe("light");
	});
});

describe("theme startup argument", () => {
	it("reads the resolved theme the window was opened with", () => {
		expect(themeFromArguments(["electron", ".", THEME_ARGUMENTS.light])).toBe("light");
		expect(themeFromArguments(["electron", ".", THEME_ARGUMENTS.dark])).toBe("dark");
	});

	it("stays dark when no theme was passed at all", () => {
		expect(themeFromArguments(["electron", "."])).toBe("dark");
	});
});

describe("theme window background", () => {
	it("paints the window with the same surface the stylesheet paints", async () => {
		const css = await Bun.file(STYLES_PATH).text();

		expect(surfaceUnder(css, "@theme static")).toBe(THEME_BACKGROUND.dark);
		expect(surfaceUnder(css, "html\\.theme-light")).toBe(THEME_BACKGROUND.light);
	});
});
