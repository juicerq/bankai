import { describe, expect, test } from "bun:test";
import { ClaudeHarness } from "@main/activity/claude";
import { DEFAULT_HARNESS_SETTINGS, harnessLaunch, launchableHarnesses } from "@main/activity/harnesses";
import { Settings } from "@main/store/settings";
import { autostartCommandLine } from "@main/terminal/autostart";
import { shellArgs, shellCommandLine } from "@main/terminal/commandLine";
import { assertDefined } from "./utils/assertions";

describe("claude launch command", () => {
	test("starts the harness with no arguments", () => {
		const launch = ClaudeHarness.launch;
		assertDefined(launch);

		expect(launch()).toEqual({ file: "claude", args: [] });
	});
});

describe("launchable harnesses", () => {
	test("lists every harness that can be started", () => {
		expect(launchableHarnesses()).toEqual([{ id: ClaudeHarness.id, label: ClaudeHarness.label }]);
	});

	test("resolves the claude launch capability", () => {
		expect(harnessLaunch(ClaudeHarness.id)).toBe(ClaudeHarness.launch);
	});

	test("returns nothing for an unknown harness", () => {
		expect(harnessLaunch("codex")).toBeUndefined();
	});

	test("defaults to autostarting a harness that is actually launchable", () => {
		expect(DEFAULT_HARNESS_SETTINGS.autostart).toBe(true);
		expect(launchableHarnesses().map((harness) => harness.id)).toContain(DEFAULT_HARNESS_SETTINGS.id);
	});
});

describe("autostart command line", () => {
	test("types the default harness when nothing has been configured", async () => {
		expect(await autostartCommandLine()).toBe("claude");
	});

	test("types the configured harness", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id });

		expect(await autostartCommandLine()).toBe("claude");
	});

	test("types nothing when autostart is off", async () => {
		await Settings.updateHarness({ autostart: false, id: ClaudeHarness.id });

		expect(await autostartCommandLine()).toBeUndefined();
	});

	test("types nothing when the configured harness is gone", async () => {
		await Settings.updateHarness({ autostart: true, id: "codex" });

		expect(await autostartCommandLine()).toBeUndefined();
	});
});

describe("shell command line", () => {
	test("leaves a bare command and its plain arguments untouched", () => {
		expect(shellCommandLine({ file: "claude", args: [] })).toBe("claude");
		expect(shellCommandLine({ file: "claude", args: ["--resume", "67af1e51-358c"] })).toBe(
			"claude --resume 67af1e51-358c",
		);
	});

	test("quotes anything a shell would otherwise read as syntax", () => {
		expect(shellCommandLine({ file: "claude", args: ["a b"] })).toBe("claude 'a b'");
		expect(shellCommandLine({ file: "claude", args: ["; rm -rf /"] })).toBe("claude '; rm -rf /'");
		expect(shellCommandLine({ file: "claude", args: ["$(whoami)"] })).toBe("claude '$(whoami)'");
		expect(shellCommandLine({ file: "claude", args: [""] })).toBe("claude ''");
	});

	test("escapes a single quote without ending the quoted run", () => {
		expect(shellCommandLine({ file: "claude", args: ["it's"] })).toBe("claude 'it'\\''s'");
	});
});

describe("shell arguments", () => {
	test("spawns a plain interactive shell when nothing is launched", () => {
		expect(shellArgs("/usr/bin/fish")).toEqual([]);
	});

	test("runs the command and then replaces itself with the shell", () => {
		expect(shellArgs("/usr/bin/fish", "claude")).toEqual(["-i", "-c", 'claude; exec /usr/bin/fish']);
	});

	test("quotes a shell path a shell would otherwise split", () => {
		expect(shellArgs("/opt/my shell/fish", "claude")).toEqual(["-i", "-c", "claude; exec '/opt/my shell/fish'"]);
	});
});
