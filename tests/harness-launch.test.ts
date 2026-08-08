import { describe, expect, test } from "bun:test";
import { ClaudeHarness } from "@main/agents/harness/claude/claude-harness";
import { CodexHarness } from "@main/agents/harness/codex/codex-harness";
import { Harnesses } from "@main/agents/harness/harnesses";
import { HarnessSettings } from "@main/settings/harness-settings";
import { ShellAutostart } from "@main/terminal/shell-autostart";
import { ShellCommandLine } from "@main/terminal/shell-command-line";
import { HarnessAvailability } from "@main/agents/harness/harness-availability";
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
		expect(Harnesses.launchable()).toEqual([
			{ id: ClaudeHarness.id, label: ClaudeHarness.label, conversation: true, file: "claude" },
			{ id: CodexHarness.id, label: CodexHarness.label, conversation: true, file: "codex" },
		]);
	});

	test("resolves the claude launch capability", () => {
		expect(Harnesses.get(ClaudeHarness.id)?.launch).toBe(ClaudeHarness.launch);
	});

	test("resolves the codex launch capability", () => {
		expect(Harnesses.get(CodexHarness.id)?.launch).toBe(CodexHarness.launch);
	});

	test("returns nothing for an unknown harness", () => {
		expect(Harnesses.get("aider")).toBeUndefined();
	});

	test("defaults to autostarting a harness that is actually launchable", () => {
		expect(Harnesses.DEFAULT_HARNESS_SETTINGS.autostart).toBe(true);
		expect(Harnesses.launchable().map((harness) => harness.id)).toContain(Harnesses.DEFAULT_HARNESS_SETTINGS.id);
	});
});

describe("autostart command line", () => {
	test("types the default harness when nothing has been configured", async () => {
		expect(await ShellAutostart.commandLine()).toBe("claude");
	});

	test("types the configured harness", async () => {
		await HarnessSettings.update({ autostart: true, id: ClaudeHarness.id });

		expect(await ShellAutostart.commandLine()).toBe("claude");
	});

	test("types nothing when autostart is off", async () => {
		await HarnessSettings.update({ autostart: false, id: ClaudeHarness.id });

		expect(await ShellAutostart.commandLine()).toBeUndefined();
	});

	test("types nothing when the configured harness is gone", async () => {
		await HarnessSettings.update({ autostart: true, id: "aider" });

		expect(await ShellAutostart.commandLine()).toBeUndefined();
	});

	test("appends the configured extra arguments", async () => {
		await HarnessSettings.update({
			autostart: true,
			id: ClaudeHarness.id,
			profiles: { [ClaudeHarness.id]: { args: "--model opus" } },
		});

		expect(await ShellAutostart.commandLine()).toBe("claude --model opus");
	});
});

describe("harness command line", () => {
	test("appends the extra arguments of the configured harness to a resume", async () => {
		await HarnessSettings.update({
			autostart: true,
			id: ClaudeHarness.id,
			profiles: { [ClaudeHarness.id]: { args: "--model opus" } },
		});

		expect(await ShellAutostart.harnessLine({ file: "claude", args: ["--resume", "67af"] }, ClaudeHarness.id)).toBe(
			"claude --resume 67af --model opus",
		);
	});

	test("appends the resumed harness's own arguments, not the selected harness's", async () => {
		await HarnessSettings.update({
			autostart: true,
			id: ClaudeHarness.id,
			profiles: {
				[ClaudeHarness.id]: { args: "--model opus" },
				[CodexHarness.id]: { args: "--model gpt-5.6" },
			},
		});

		expect(await ShellAutostart.harnessLine({ file: "codex", args: ["resume", "67af"] }, CodexHarness.id)).toBe(
			"codex resume 67af --model gpt-5.6",
		);
	});

	test("leaves a resume of a harness with no profile untouched", async () => {
		await HarnessSettings.update({
			autostart: true,
			id: ClaudeHarness.id,
			profiles: { [ClaudeHarness.id]: { args: "--model opus" } },
		});

		expect(await ShellAutostart.harnessLine({ file: "codex", args: ["resume", "67af"] }, CodexHarness.id)).toBe(
			"codex resume 67af",
		);
	});
});

describe("argument splitting", () => {
	test("splits on whitespace", () => {
		expect(ShellCommandLine.split("  --model opus  ")).toEqual(["--model", "opus"]);
		expect(ShellCommandLine.split("")).toEqual([]);
	});

	test("keeps a quoted run together and drops the quotes", () => {
		expect(ShellCommandLine.split(`--append-system-prompt "be brief"`)).toEqual(["--append-system-prompt", "be brief"]);
		expect(ShellCommandLine.split(`--flag='a b'`)).toEqual(["--flag=a b"]);
	});

	test("never lets typed text become shell syntax", () => {
		expect(ShellCommandLine.of({ file: "claude", args: ShellCommandLine.split("; rm -rf /") })).toBe("claude ';' rm -rf /");
	});
});

describe("shell command line", () => {
	test("leaves a bare command and its plain arguments untouched", () => {
		expect(ShellCommandLine.of({ file: "claude", args: [] })).toBe("claude");
		expect(ShellCommandLine.of({ file: "claude", args: ["--resume", "67af1e51-358c"] })).toBe(
			"claude --resume 67af1e51-358c",
		);
	});

	test("quotes anything a shell would otherwise read as syntax", () => {
		expect(ShellCommandLine.of({ file: "claude", args: ["a b"] })).toBe("claude 'a b'");
		expect(ShellCommandLine.of({ file: "claude", args: ["; rm -rf /"] })).toBe("claude '; rm -rf /'");
		expect(ShellCommandLine.of({ file: "claude", args: ["$(whoami)"] })).toBe("claude '$(whoami)'");
		expect(ShellCommandLine.of({ file: "claude", args: [""] })).toBe("claude ''");
	});

	test("escapes a single quote without ending the quoted run", () => {
		expect(ShellCommandLine.of({ file: "claude", args: ["it's"] })).toBe("claude 'it'\\''s'");
	});
});

describe("shell launch line", () => {
	test("launches the harness in an ordinary shell", async () => {
		await HarnessSettings.update({ autostart: true, id: ClaudeHarness.id });

		expect(await ShellAutostart.launchLine({})).toBe("claude");
	});

	test("launches nothing in a plain shell", async () => {
		await HarnessSettings.update({ autostart: true, id: ClaudeHarness.id });

		expect(await ShellAutostart.launchLine({ plain: true })).toBeUndefined();
	});

	test("launches the saved command instead of the harness", async () => {
		await HarnessSettings.update({ autostart: true, id: ClaudeHarness.id });

		expect(await ShellAutostart.launchLine({ plain: true, launch: "bun run dev" })).toBe("bun run dev");
	});
});

describe("shell arguments", () => {
	test("spawns a plain interactive shell when nothing is launched", () => {
		expect(ShellCommandLine.shellArgs("/usr/bin/fish")).toEqual([]);
	});

	test("runs the command and then replaces itself with the shell", () => {
		expect(ShellCommandLine.shellArgs("/usr/bin/fish", "claude")).toEqual(["-i", "-c", `${process.platform === "linux" ? "setsid " : ""}claude; exec /usr/bin/fish`]);
	});

	test("quotes a shell path a shell would otherwise split", () => {
		expect(ShellCommandLine.shellArgs("/opt/my shell/fish", "claude")).toEqual(["-i", "-c", `${process.platform === "linux" ? "setsid " : ""}claude; exec '/opt/my shell/fish'`]);
	});
});

describe("harness availability", () => {
	test("finds a binary the user's interactive shell resolves", async () => {
		expect(await HarnessAvailability.check("ls")).toBe(true);
	});

	test("reports a binary no shell can find", async () => {
		expect(await HarnessAvailability.check("bankai-not-a-real-binary")).toBe(false);
	});
});
