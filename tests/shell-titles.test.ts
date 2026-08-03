import { afterEach, describe, expect, it } from "bun:test";
import { forgetShellTitle, noteShellTitle, shellTitles } from "@main/terminal/shell-titles";

const BEL = "\u0007";
const ESC = "\u001b";

afterEach(() => {
	forgetShellTitle("s1");
});

describe("shell titles", () => {
	it("sniffs an OSC 0 title terminated by BEL", () => {
		noteShellTitle("s1", `${ESC}]0;jui@box: ~/projects${BEL}$ `);

		expect(shellTitles.get("s1")).toBe("jui@box: ~/projects");
	});

	it("sniffs an OSC 2 title terminated by ST", () => {
		noteShellTitle("s1", `${ESC}]2;nvim src/main.ts${ESC}\\`);

		expect(shellTitles.get("s1")).toBe("nvim src/main.ts");
	});

	it("keeps the last title of a chunk that carries several", () => {
		noteShellTitle("s1", `${ESC}]0;first${BEL}output${ESC}]0;second${BEL}`);

		expect(shellTitles.get("s1")).toBe("second");
	});

	it("stores the title raw, without reading a command out of it", () => {
		noteShellTitle("s1", `${ESC}]0;✳ 42% · bun test${BEL}`);

		expect(shellTitles.get("s1")).toBe("✳ 42% · bun test");
	});

	it("joins a sequence split across two chunks", () => {
		noteShellTitle("s1", `output${ESC}]0;split ti`);
		noteShellTitle("s1", `tle${BEL}more output`);

		expect(shellTitles.get("s1")).toBe("split title");
	});

	it("ignores an empty title and other escape sequences", () => {
		noteShellTitle("s1", `${ESC}[2J${ESC}]0;${BEL}${ESC}]4;1;#ff0000${BEL}`);

		expect(shellTitles.get("s1")).toBeUndefined();
	});

	it("holds the last title until the shell is forgotten", () => {
		noteShellTitle("s1", `${ESC}]0;held${BEL}`);
		noteShellTitle("s1", "plain output with no title");

		expect(shellTitles.get("s1")).toBe("held");

		forgetShellTitle("s1");

		expect(shellTitles.get("s1")).toBeUndefined();
	});
});
