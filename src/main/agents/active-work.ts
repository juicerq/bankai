import { AgentActivity } from "@main/agents/agent-activity";
import { shellProcesses } from "@main/terminal/shell-processes";
import type { UpdateWorkload } from "@shared/update";

function countActiveWork(): UpdateWorkload {
	const shells = shellProcesses.list();

	if (process.platform !== "linux") {
		return { kind: "shells", count: shells.length };
	}

	const projectIds = new Set(shells.map((shell) => shell.projectId));
	let count = 0;

	for (const projectId of projectIds) {
		for (const state of Object.values(AgentActivity.getProjectSnapshot(projectId).shells)) {
			if (state === "working" || state === "needs-attention") {
				count += 1;
			}
		}
	}

	return { kind: "agents", count };
}

export const ActiveWork = {
	count: countActiveWork,
};
