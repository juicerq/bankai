import { describe, expect, test } from "bun:test";
import { ClaudeHarness } from "@main/activity/claude";
import { DEFAULT_HARNESS_SETTINGS, harnessLaunch, launchableHarnesses } from "@main/activity/harnesses";
import { Settings } from "@main/store/settings";
import { autostartCommandLine, harnessCommandLine, shellLaunchLine } from "@main/terminal/autostart";
import { shellArgs, shellCommandLine, splitArguments } from "@main/terminal/commandLine";
import { harnessAvailable } from "@main/terminal/harnessAvailability";
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
		expect(launchableHarnesses()).toEqual([
			{ id: ClaudeHarness.id, label: ClaudeHarness.label, file: "claude" },
		]);
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

	test("appends the configured extra arguments", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id, args: "--model opus" });

		expect(await autostartCommandLine()).toBe("claude --model opus");
	});
});

describe("harness command line", () => {
	test("appends the extra arguments of the configured harness to a resume", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id, args: "--model opus" });

		expect(await harnessCommandLine({ file: "claude", args: ["--resume", "67af"] }, ClaudeHarness.id)).toBe(
			"claude --resume 67af --model opus",
		);
	});

	test("leaves a resume of another harness untouched", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id, args: "--model opus" });

		expect(await harnessCommandLine({ file: "codex", args: ["resume", "67af"] }, "codex")).toBe(
			"codex resume 67af",
		);
	});
});

describe("argument splitting", () => {
	test("splits on whitespace", () => {
		expect(splitArguments("  --model opus  ")).toEqual(["--model", "opus"]);
		expect(splitArguments("")).toEqual([]);
	});

	test("keeps a quoted run together and drops the quotes", () => {
		expect(splitArguments(`--append-system-prompt "be brief"`)).toEqual(["--append-system-prompt", "be brief"]);
		expect(splitArguments(`--flag='a b'`)).toEqual(["--flag=a b"]);
	});

	test("never lets typed text become shell syntax", () => {
		expect(shellCommandLine({ file: "claude", args: splitArguments("; rm -rf /") })).toBe("claude ';' rm -rf /");
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

describe("shell launch line", () => {
	test("launches the harness in an ordinary shell", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id });

		expect(await shellLaunchLine({})).toBe("claude");
	});

	test("launches nothing in a plain shell", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id });

		expect(await shellLaunchLine({ plain: true })).toBeUndefined();
	});

	test("launches the saved command instead of the harness", async () => {
		await Settings.updateHarness({ autostart: true, id: ClaudeHarness.id });

		expect(await shellLaunchLine({ plain: true, launch: "bun run dev" })).toBe("bun run dev");
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

describe("harness availability", () => {
	test("finds a binary the user's interactive shell resolves", async () => {
		expect(await harnessAvailable("ls")).toBe(true);
	});

	test("reports a binary no shell can find", async () => {
		expect(await harnessAvailable("bankai-not-a-real-binary")).toBe(false);
	});
});
