import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { codexConfigDir } from "@main/activity/codexConfig";
import type { HarnessLiveTrace } from "@main/activity/Harness";
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
import { CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import { type HookInstall, installedSettings, uninstalledSettings } from "@main/activity/hookSettings";
import { Logger } from "@main/logger";

export const CODEX_HOOK_SCRIPT_NAME = "bankai-codex-trace.sh";

export const CODEX_HOOK_EVENTS = ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];

const CODEX_ANY_TOOL = ".*";

export const CODEX_HOOK_INSTALL: HookInstall = {
	scriptName: CODEX_HOOK_SCRIPT_NAME,
	events: CODEX_HOOK_EVENTS,
	matchedEvents: new Set(["PreToolUse", "PostToolUse"]),
	matcher: CODEX_ANY_TOOL,
};

const INLINE_HOOK_TABLE = /^\s*\[\[?hooks(\]|\.(?!state[.\]]))/m;

export function codexHooksPath(): string {
	return join(codexConfigDir(), "hooks.json");
}

function codexConfigPath(): string {
	return join(codexConfigDir(), "config.toml");
}

async function inlineHooksWouldClash(): Promise<boolean> {
	const hooksJson = await readFile(codexHooksPath(), "utf8").catch(() => null);
	if (hooksJson !== null) {
		return false;
	}

	const config = await readFile(codexConfigPath(), "utf8").catch(() => null);

	return config !== null && INLINE_HOOK_TABLE.test(config);
}

export const codexLiveTrace: HarnessLiveTrace = {
	async install(): Promise<void> {
		if (await inlineHooksWouldClash()) {
			Logger.warn("codex-hooks:inline-hooks-present", {
				config: codexConfigPath(),
			});
			return;
		}

		await writeHookScript(CODEX_HOOK_SCRIPT_NAME, hookScript(hookSpoolDir(), spoolPrefix(CODEX_HARNESS_ID)));
		await rewriteJsonConfig(codexHooksPath(), (current) =>
			installedSettings(current, shellQuoted(hookScriptPath(CODEX_HOOK_SCRIPT_NAME)), CODEX_HOOK_INSTALL),
		);
	},
	async uninstall(): Promise<void> {
		await rewriteJsonConfig(codexHooksPath(), (current) => uninstalledSettings(current, CODEX_HOOK_SCRIPT_NAME));
		await rm(hookScriptPath(CODEX_HOOK_SCRIPT_NAME), { force: true });
		await clearSpool(CODEX_HARNESS_ID);
	},
};
