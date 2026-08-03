import { afterEach, describe, expect, it } from "bun:test";
import { ShellTitles } from "@main/terminal/shell-titles";

const BEL = "\u0007";
const ESC = "\u001b";

afterEach(() => {
	ShellTitles.forget("s1");
});

describe("shell titles", () => {
	it("sniffs an OSC 0 title terminated by BEL", () => {
		ShellTitles.note("s1", `${ESC}]0;jui@box: ~/projects${BEL}$ `);

		expect(ShellTitles.byShell.get("s1")).toBe("jui@box: ~/projects");
	});

	it("sniffs an OSC 2 title terminated by ST", () => {
		ShellTitles.note("s1", `${ESC}]2;nvim src/main.ts${ESC}\\`);

		expect(ShellTitles.byShell.get("s1")).toBe("nvim src/main.ts");
	});

	it("keeps the last title of a chunk that carries several", () => {
		ShellTitles.note("s1", `${ESC}]0;first${BEL}output${ESC}]0;second${BEL}`);

		expect(ShellTitles.byShell.get("s1")).toBe("second");
	});

	it("stores the title raw, without reading a command out of it", () => {
		ShellTitles.note("s1", `${ESC}]0;✳ 42% · bun test${BEL}`);

		expect(ShellTitles.byShell.get("s1")).toBe("✳ 42% · bun test");
	});

	it("joins a sequence split across two chunks", () => {
		ShellTitles.note("s1", `output${ESC}]0;split ti`);
		ShellTitles.note("s1", `tle${BEL}more output`);

		expect(ShellTitles.byShell.get("s1")).toBe("split title");
	});

	it("ignores an empty title and other escape sequences", () => {
		ShellTitles.note("s1", `${ESC}[2J${ESC}]0;${BEL}${ESC}]4;1;#ff0000${BEL}`);

		expect(ShellTitles.byShell.get("s1")).toBeUndefined();
	});

	it("holds the last title until the shell is forgotten", () => {
		ShellTitles.note("s1", `${ESC}]0;held${BEL}`);
		ShellTitles.note("s1", "plain output with no title");

		expect(ShellTitles.byShell.get("s1")).toBe("held");

		ShellTitles.forget("s1");

		expect(ShellTitles.byShell.get("s1")).toBeUndefined();
	});
});
