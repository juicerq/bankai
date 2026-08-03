import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ClaudeHooks } from "@main/agents/harness/claude/claude-hooks";
import { assertDefined } from "./utils/assertions";

const CLAUDE_SCRIPT = "bankai-trace.sh";
const CODEX_SCRIPT = "bankai-codex-trace.sh";

function bankaiGroup(scriptName: string) {
	return { hooks: [{ type: "command", command: `'/home/jui/.config/Bankai/store/hooks/${scriptName}'` }] };
}

const OWN_GROUP = { hooks: [{ type: "command", command: "~/.claude/hooks/notify.sh", timeout: 2 }] };

describe("taking the bankai group out of a harness configuration", () => {
	test("keeps every hook the user owns", () => {
		const next = ClaudeHooks.settingsWithout(
			{ model: "opus", hooks: { Stop: [OWN_GROUP, bankaiGroup(CLAUDE_SCRIPT)] } },
			CLAUDE_SCRIPT,
		);

		expect(next).toEqual({ model: "opus", hooks: { Stop: [OWN_GROUP] } });
	});

	test("drops the hooks key when bankai was the only thing in it", () => {
		const next = ClaudeHooks.settingsWithout(
			{ model: "opus", hooks: { Stop: [bankaiGroup(CLAUDE_SCRIPT)], Notification: [bankaiGroup(CLAUDE_SCRIPT)] } },
			CLAUDE_SCRIPT,
		);

		expect(next).toEqual({ model: "opus" });
	});

	test("leaves the group of another harness alone", () => {
		const settings = { hooks: { Stop: [bankaiGroup(CODEX_SCRIPT)] } };

		expect(ClaudeHooks.settingsWithout(settings, CLAUDE_SCRIPT)).toEqual(settings);
	});
});

describe("removing what bankai installed", () => {
	let home: string | undefined;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "bankai-hook-removal-"));
		process.env.CLAUDE_CONFIG_DIR = join(home, "claude");
		process.env.CODEX_HOME = join(home, "codex");
		mkdirSync(process.env.CLAUDE_CONFIG_DIR);
		mkdirSync(process.env.CODEX_HOME);
	});

	afterEach(() => {
		if (home) {
			rmSync(home, { recursive: true, force: true });
			home = undefined;
		}
		delete process.env.CLAUDE_CONFIG_DIR;
		delete process.env.CODEX_HOME;
	});

	function claudeSettingsPath(): string {
		assertDefined(process.env.CLAUDE_CONFIG_DIR);

		return join(process.env.CLAUDE_CONFIG_DIR, "settings.json");
	}

	function codexHooksPath(): string {
		assertDefined(process.env.CODEX_HOME);

		return join(process.env.CODEX_HOME, "hooks.json");
	}

	function seedHookDir(): string {
		assertDefined(process.env.DATA_DIR);
		const hooks = join(process.env.DATA_DIR, "hooks");
		mkdirSync(join(hooks, "spool"), { recursive: true });
		writeFileSync(join(hooks, CLAUDE_SCRIPT), "#!/bin/sh\n");
		writeFileSync(join(hooks, "spool", "claude-abc.spool"), "");

		return hooks;
	}

	test("clears both harness configurations and the scripts and spool it wrote", async () => {
		writeFileSync(
			claudeSettingsPath(),
			JSON.stringify({ model: "opus", hooks: { Stop: [OWN_GROUP, bankaiGroup(CLAUDE_SCRIPT)] } }),
		);
		writeFileSync(codexHooksPath(), JSON.stringify({ hooks: { Stop: [bankaiGroup(CODEX_SCRIPT)] } }));
		const hooks = seedHookDir();

		await ClaudeHooks.removeInstalled();

		expect(JSON.parse(readFileSync(claudeSettingsPath(), "utf8"))).toEqual({
			model: "opus",
			hooks: { Stop: [OWN_GROUP] },
		});
		expect(JSON.parse(readFileSync(codexHooksPath(), "utf8"))).toEqual({});
		expect(existsSync(hooks)).toBe(false);
	});

	test("a configuration that does not parse is left exactly as it was", async () => {
		const broken = '{ "hooks": ';
		writeFileSync(claudeSettingsPath(), broken);
		const hooks = seedHookDir();

		const failure = await ClaudeHooks.removeInstalled().then(() => null, (err: unknown) => err);

		expect(failure).toBeInstanceOf(Error);

		expect(readFileSync(claudeSettingsPath(), "utf8")).toBe(broken);
		expect(existsSync(hooks)).toBe(true);
	});

	test("a configuration bankai never touched is not rewritten", async () => {
		const untouched = JSON.stringify({ hooks: { Stop: [OWN_GROUP] } });
		writeFileSync(claudeSettingsPath(), untouched);

		await ClaudeHooks.removeInstalled();

		expect(readFileSync(claudeSettingsPath(), "utf8")).toBe(untouched);
	});

	test("a harness with no configuration file is nothing to clean", async () => {
		await ClaudeHooks.removeInstalled();

		expect(existsSync(claudeSettingsPath())).toBe(false);
	});
});
