import { AgentActivity } from "@main/activity/AgentActivity";
import { harnessHooks, hookableHarnessIds } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { type HarnessSettings, harnessHooksEnabled, harnessProfile } from "@main/store/settings";

export function hookedHarnesses(harness?: HarnessSettings): Set<string> {
	return new Set(hookableHarnessIds().filter((id) => harnessHooksEnabled(harnessProfile(harness, id))));
}

export async function applyHarnessHooks(harness: HarnessSettings | undefined): Promise<void> {
	if (process.platform !== "linux") {
		return;
	}

	const hooked = hookedHarnesses(harness);
	AgentActivity.setHookedHarnesses(hooked);
	await Promise.all(hookableHarnessIds().map((id) => applyHooks(id, hooked.has(id))));
}

async function applyHooks(harnessId: string, enabled: boolean): Promise<void> {
	const hooks = harnessHooks(harnessId);
	if (!hooks) {
		return;
	}

	const apply = enabled ? hooks.install() : hooks.uninstall();
	await apply.catch((err: unknown) => {
		Logger.error("harness-hooks:apply-failed", {
			harness: harnessId,
			enabled,
			err: String(err),
		});
	});
}
