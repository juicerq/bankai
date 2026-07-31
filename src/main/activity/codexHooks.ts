import { rm } from "node:fs/promises";
import { join } from "node:path";
import { codexConfigDir } from "@main/activity/codexConfig";
import { clearSpool, hookScriptPath, rewriteJsonConfig } from "@main/activity/HookSource";
import { CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import { uninstalledSettings } from "@main/activity/hookSettings";

export const CODEX_HOOK_SCRIPT_NAME = "bankai-codex-trace.sh";

export function codexHooksPath(): string {
	return join(codexConfigDir(), "hooks.json");
}

export async function uninstallCodexHooks(): Promise<void> {
	await rewriteJsonConfig(codexHooksPath(), (current) => uninstalledSettings(current, CODEX_HOOK_SCRIPT_NAME));
	await rm(hookScriptPath(CODEX_HOOK_SCRIPT_NAME), { force: true });
	await clearSpool(CODEX_HARNESS_ID);
}
