import { AgentActivity } from "@main/activity/AgentActivity";
import { uninstallCodexHooks } from "@main/activity/codexHooks";
import { applyHarnessHooks } from "@main/activity/harnessHooks";
import { Logger } from "@main/logger";
import { Settings } from "@main/store/settings";

export function startAgentActivity(): void {
	AgentActivity.start();

	Settings.get()
		.then((settings) => applyHarnessHooks(settings.harness))
		.catch((err) => Logger.error("harness-hooks:settings-unreadable", { err: String(err) }));

	uninstallCodexHooks().catch((err) => Logger.warn("codex-hooks:removal-failed", { err: String(err) }));
}
