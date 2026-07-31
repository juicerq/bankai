import { useMemo } from "react";
import type { ContinuityValue } from "@main/store/continuity";
import { sessionRows } from "@renderer/routes/-utils/session-rows";
import type { AgentActivities } from "@renderer/routes/-utils/use-agent-activity";

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
				attention: activity.attention,
			}),
		[continuity, projects, activity],
	);
}
