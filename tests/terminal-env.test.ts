import { describe, expect, it } from "bun:test";
import { TerminalEnv } from "@main/terminal/terminal-env";

describe("terminal environment", () => {
	it("keeps the inherited environment a shell needs", () => {
		const env = TerminalEnv.of({ PATH: "/usr/bin", HOME: "/home/jui", EMPTY: undefined });

		expect(env.PATH).toBe("/usr/bin");
		expect(env.HOME).toBe("/home/jui");
		expect("EMPTY" in env).toBe(false);
	});

	it("forces its own terminal capabilities", () => {
		const env = TerminalEnv.of({ TERM: "dumb", COLORTERM: "" });

		expect(env.TERM).toBe("xterm-256color");
		expect(env.COLORTERM).toBe("truecolor");
	});

	it("drops the markers that make a spawned agent behave as a nested child session", () => {
		const env = TerminalEnv.of({
			CLAUDECODE: "1",
			CLAUDE_CODE_CHILD_SESSION: "1",
			CLAUDE_CODE_ENTRYPOINT: "cli",
			CLAUDE_CODE_EXECPATH: "/home/jui/.bun/bin/claude",
			CLAUDE_CODE_SESSION_ID: "67af1e51-358c-475f-b33a-7de1e199d0a5",
			CLAUDE_PID: "1234",
		});

		expect(Object.keys(env).filter((key) => key.startsWith("CLAUDE"))).toEqual([]);
	});

	it("keeps agent configuration that is not a session marker", () => {
		const env = TerminalEnv.of({ CLAUDE_CONFIG_DIR: "/home/jui/.claude" });

		expect(env.CLAUDE_CONFIG_DIR).toBe("/home/jui/.claude");
	});
});
