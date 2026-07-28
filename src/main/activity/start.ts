import { AgentActivity } from "@main/activity/AgentActivity";
import { applyLiveTrace } from "@main/activity/liveTrace";
import { Logger } from "@main/logger";
import { Settings } from "@main/store/settings";

export function startAgentActivity(): void {
	AgentActivity.start();

	Settings.get()
		.then((settings) => applyLiveTrace(settings.harness))
		.catch((err) => Logger.error("hook-source:settings-unreadable", { err: String(err) }));
}
