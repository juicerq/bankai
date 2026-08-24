import type { UpdateWorkload } from "@shared/update";

export function workloadLosses({ kind, count }: UpdateWorkload): string {
	if (kind === "agents") {
		return `stops ${count} ${count === 1 ? "agent" : "agents"} mid-turn`;
	}

	return `closes ${count} open ${count === 1 ? "shell" : "shells"}`;
}
