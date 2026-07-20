import { describe, expect, it } from "vitest";
import { spawnArgv } from "@core/terminal/TerminalTab";

describe("spawnArgv", () => {
	it("opens a bare interactive shell when no command is given", () => {
		expect(spawnArgv("/usr/bin/fish")).toEqual(["setsid", "-c", "/usr/bin/fish"]);
	});

	it("runs the command first, then drops back into an interactive shell", () => {
		expect(spawnArgv("/bin/bash", "claude")).toEqual([
			"setsid",
			"-c",
			"/bin/bash",
			"-c",
			"claude; exec /bin/bash",
		]);
	});

	it("embeds an already-quoted command verbatim without re-quoting", () => {
		expect(spawnArgv("/bin/bash", "codex --model 'gpt 5'")).toEqual([
			"setsid",
			"-c",
			"/bin/bash",
			"-c",
			"codex --model 'gpt 5'; exec /bin/bash",
		]);
	});
});
