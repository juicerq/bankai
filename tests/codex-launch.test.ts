import { describe, expect, test } from "bun:test";
import { CodexHarness, interactiveCommandLine, rolloutCandidates } from "@main/agents/harness/codex/codex-harness";
import { CodexConfig } from "@main/agents/harness/codex/codex-config";
import { HarnessSettings } from "@main/settings/harness-settings";
import { ShellAutostart } from "@main/terminal/shell-autostart";
import { assertDefined } from "./utils/assertions";

const SESSION = "019f898d-719d-7811-9b34-86470df90a52";

describe("codex launch command", () => {
	test("starts the interactive TUI with no arguments", () => {
		const launch = CodexHarness.launch;
		assertDefined(launch);

		expect(launch()).toEqual({ file: "codex", args: [] });
	});
});

describe("codex resume command", () => {
	test("returns to a session by its uuid", () => {
		const resume = CodexHarness.resume;
		assertDefined(resume);

		expect(resume({ sessionId: SESSION })).toEqual({ file: "codex", args: ["resume", SESSION] });
	});

	test("refuses an id that is not a session uuid", () => {
		const resume = CodexHarness.resume;
		assertDefined(resume);

		expect(resume({ sessionId: "--help" })).toBeNull();
		expect(resume({ sessionId: `${SESSION}; rm -rf /` })).toBeNull();
	});

	test("quotes an extra argument that carries a space", async () => {
		await HarnessSettings.update({
			autostart: true,
			id: CodexHarness.id,
			profiles: { [CodexHarness.id]: { args: "--config 'a b'" } },
		});

		expect(await ShellAutostart.harnessLine({ file: "codex", args: ["resume", SESSION] }, CodexHarness.id)).toBe(
			`codex resume ${SESSION} --config 'a b'`,
		);
	});
});

describe("codex process roles", () => {
	test("counts the bare TUI and a resume as an agent session", () => {
		expect(interactiveCommandLine(["codex"])).toBe(true);
		expect(interactiveCommandLine(["codex", "resume", SESSION])).toBe(true);
		expect(interactiveCommandLine(["codex", "--model", "gpt-5.6"])).toBe(true);
	});

	test("counts no other subcommand as an agent session", () => {
		for (const command of ["exec", "review", "cloud", "app-server", "mcp-server", "fork", "remote-control"]) {
			expect(interactiveCommandLine(["codex", command])).toBe(false);
		}
	});

	test("counts a TUI attached to a remote app server as no local session", () => {
		expect(interactiveCommandLine(["codex", "--remote"])).toBe(false);
	});

	test("counts a process with no readable command line as no session", () => {
		expect(interactiveCommandLine(null)).toBe(false);
	});
});

describe("rollout candidates among open files", () => {
	test("keeps only rollout files under the codex sessions directory", () => {
		const sessions = CodexConfig.sessionsDir();

		expect(
			rolloutCandidates([
				`${sessions}/2026/07/22/rollout-2026-07-22T08-19-36-${SESSION}.jsonl`,
				`${sessions}/2026/07/22/notes.txt`,
				"/home/jui/projects/bankai/src/main/index.ts",
				"/tmp/rollout-fake.jsonl",
			]),
		).toEqual([`${sessions}/2026/07/22/rollout-2026-07-22T08-19-36-${SESSION}.jsonl`]);
	});
});
