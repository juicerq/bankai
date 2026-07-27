import { AgentActivity } from "@main/activity/AgentActivity";
import { applyHookSource } from "@main/activity/HookSource";
import { type HarnessSettings, liveTraceEnabled } from "@main/store/settings";

export async function applyLiveTrace(harness: HarnessSettings | undefined): Promise<void> {
	if (process.platform !== "linux") {
		return;
	}

	const enabled = liveTraceEnabled(harness);
	AgentActivity.setLiveTrace(enabled);
	await applyHookSource(enabled);
}
