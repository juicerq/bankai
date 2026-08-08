import { useMemo } from "react";
import type { ContinuityValue } from "@shared/continuity";
import { sessionRows } from "@renderer/routes/-features/sessions/list/session-rows";
import type { AgentActivities } from "@renderer/routes/-features/sessions/list/use-agent-activity";

export function useSessionRows({
	continuity,
	projects,
	activity,
}: {
	continuity: ContinuityValue;
	projects: { id: string; name: string }[];
	activity: AgentActivities;
}) {
	return useMemo(
		() =>
			sessionRows({
				continuity,
				projects,
				shellActivity: activity.shells,
				statusSince: activity.statusSince,
				harnesses: activity.harnesses,
			}),
		[continuity, projects, activity],
	);
}
