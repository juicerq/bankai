import { describe, expect, it } from "vitest";
import {
	PI_COMPANION_ACTIVE_ENV,
	PI_DISCOVERY_DIR_ENV,
} from "@core/harness/pi/protocol";
import { bankaiTerminalEnv, spawnArgv } from "@core/terminal/TerminalTab";

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

	it("activates the Pi companion only inside bankai terminals", () => {
		const env = bankaiTerminalEnv();

		expect(env[PI_COMPANION_ACTIVE_ENV]).toBe("1");
		expect(env[PI_DISCOVERY_DIR_ENV]).toContain("pi-sessions");
	});
});
