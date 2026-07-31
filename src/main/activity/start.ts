import { AgentActivity } from "@main/activity/AgentActivity";
import { removeInstalledHooks } from "@main/activity/hookRemoval";
import { Logger } from "@main/logger";

export function startAgentActivity(): void {
	AgentActivity.start();

	removeInstalledHooks().catch((err) => Logger.warn("hooks:removal-failed", { err: String(err) }));
}
