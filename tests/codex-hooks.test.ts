import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOOK_SCRIPT_NAME } from "@main/activity/claudeHooks";
import { CODEX_HOOK_SCRIPT_NAME, codexHooksPath, uninstallCodexHooks } from "@main/activity/codexHooks";
import { hookScriptPath, hookSpoolDir, shellQuoted, writeHookScript } from "@main/activity/HookSource";

const SESSION = "019fb42f-6131-7b33-aca6-154f86ed4f64";

const USER_HOOK = {
	matcher: "Edit|Write",
	hooks: [{ type: "command", command: "~/.codex/hooks/forward-event.sh", timeout: 2 }],
};

function bankaiGroup() {
	return { matcher: ".*", hooks: [{ type: "command", command: shellQuoted(hookScriptPath(CODEX_HOOK_SCRIPT_NAME)) }] };
}

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bankai-codex-home-"));
	process.env.CODEX_HOME = home;
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
	delete process.env.CODEX_HOME;
});

function hooks(): unknown {
	return JSON.parse(readFileSync(codexHooksPath(), "utf8"));
}

describe("removing the codex hook an older version installed", () => {
	test("leaves the user's own hooks running", async () => {
		writeFileSync(codexHooksPath(), JSON.stringify({ hooks: { PostToolUse: [USER_HOOK, bankaiGroup()] } }));
		await uninstallCodexHooks();

		expect(hooks()).toEqual({ hooks: { PostToolUse: [USER_HOOK] } });
	});

	test("drops an event whose only group was bankai's", async () => {
		writeFileSync(
			codexHooksPath(),
			JSON.stringify({ schemaVersion: 3, hooks: { Stop: [bankaiGroup()], PostToolUse: [bankaiGroup()] } }),
		);
		await uninstallCodexHooks();

		expect(hooks()).toEqual({ schemaVersion: 3 });
	});

	test("takes the script it wrote into bankai's data directory with it", async () => {
		await writeHookScript(CODEX_HOOK_SCRIPT_NAME, "#!/bin/sh\nexit 0\n");
		await uninstallCodexHooks();

		expect(existsSync(hookScriptPath(CODEX_HOOK_SCRIPT_NAME))).toBe(false);
	});

	test("removes only codex's spool", async () => {
		mkdirSync(hookSpoolDir(), { recursive: true });
		writeFileSync(join(hookSpoolDir(), `codex-${SESSION}.spool`), "x");
		writeFileSync(join(hookSpoolDir(), `claude-${SESSION}.spool`), "x");
		await uninstallCodexHooks();

		expect(await readdir(hookSpoolDir())).toEqual([`claude-${SESSION}.spool`]);
	});

	test("writes no hooks file on a machine that never had one", async () => {
		await uninstallCodexHooks();

		expect(await readdir(home)).toEqual([]);
	});

	test("names the two harnesses' scripts so removing one never removes the other", () => {
		expect(CODEX_HOOK_SCRIPT_NAME.includes(HOOK_SCRIPT_NAME)).toBe(false);
		expect(HOOK_SCRIPT_NAME.includes(CODEX_HOOK_SCRIPT_NAME)).toBe(false);
	});
});
