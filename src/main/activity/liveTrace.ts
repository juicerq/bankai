import { AgentActivity } from "@main/activity/AgentActivity";
import { harnessIds, harnessLiveTrace } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { type HarnessSettings, harnessProfile, liveTraceEnabled } from "@main/store/settings";

export function tracedHarnesses(harness?: HarnessSettings): Set<string> {
	return new Set(harnessIds().filter((id) => liveTraceEnabled(harnessProfile(harness, id))));
}

export async function applyLiveTrace(harness: HarnessSettings | undefined): Promise<void> {
	if (process.platform !== "linux") {
		return;
	}

	const traced = tracedHarnesses(harness);
	AgentActivity.setLiveTrace(traced);
	await Promise.all(harnessIds().map((id) => applyHookSource(id, traced.has(id))));
}

async function applyHookSource(harnessId: string, enabled: boolean): Promise<void> {
	const liveTrace = harnessLiveTrace(harnessId);
	if (!liveTrace) {
		return;
	}

	const apply = enabled ? liveTrace.install() : liveTrace.uninstall();
	await apply.catch((err: unknown) => {
		Logger.error("hook-source:apply-failed", {
			harness: harnessId,
			enabled,
			err: String(err),
		});
	});
}
