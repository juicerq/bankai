import { rm } from "node:fs/promises";
import { join } from "node:path";
import { claudeConfigDir } from "@main/activity/claudeConfig";
import type { HarnessHooks } from "@main/activity/Harness";
import {
	clearSpool,
	hookScript,
	hookScriptPath,
	hookSpoolDir,
	rewriteJsonConfig,
	shellQuoted,
	spoolPrefix,
	writeHookScript,
} from "@main/activity/HookSource";
import { CLAUDE_HARNESS_ID } from "@main/activity/harnessIds";
import { type HookInstall, installedSettings, uninstalledSettings } from "@main/activity/hookSettings";

export const HOOK_SCRIPT_NAME = "bankai-trace.sh";

export const HOOK_EVENTS = ["Stop", "Notification"];

export const CLAUDE_HOOK_INSTALL: HookInstall = {
	scriptName: HOOK_SCRIPT_NAME,
	events: HOOK_EVENTS,
};

function claudeSettingsPath(): string {
	return join(claudeConfigDir(), "settings.json");
}

export const claudeHooks: HarnessHooks = {
	async install(): Promise<void> {
		await writeHookScript(HOOK_SCRIPT_NAME, hookScript(hookSpoolDir(), spoolPrefix(CLAUDE_HARNESS_ID)));
		await rewriteJsonConfig(claudeSettingsPath(), (current) =>
			installedSettings(current, shellQuoted(hookScriptPath(HOOK_SCRIPT_NAME)), CLAUDE_HOOK_INSTALL),
		);
	},
	async uninstall(): Promise<void> {
		await rewriteJsonConfig(claudeSettingsPath(), (current) => uninstalledSettings(current, HOOK_SCRIPT_NAME));
		await rm(hookScriptPath(HOOK_SCRIPT_NAME), { force: true });
		await clearSpool(CLAUDE_HARNESS_ID);
	},
};
