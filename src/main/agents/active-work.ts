import { AgentActivity } from "@main/agents/agent-activity";
import { shellProcesses } from "@main/terminal/shell-processes";
import type { UpdateWorkload } from "@shared/update";

function countActiveWork(): UpdateWorkload {
	const shells = shellProcesses.list();

	if (process.platform !== "linux") {
		return { kind: "shells", count: shells.length };
	}

	return { kind: "agents", count: AgentActivity.countWorking(new Set(shells.map((shell) => shell.projectId))) };
}

export const ActiveWork = {
	count: countActiveWork,
};
