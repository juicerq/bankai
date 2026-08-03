import { AgentActivity } from "@main/agents/agent-activity";
import { removeInstalledHooks } from "@main/agents/harness/claude/claude-hooks";
import { Logger } from "@main/infra/logger";

export function startAgentActivity(): void {
	AgentActivity.start();

	removeInstalledHooks().catch((err) => Logger.warn("hooks:removal-failed", { err: String(err) }));
}
