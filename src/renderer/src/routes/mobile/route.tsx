import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { orpc } from "@renderer/lib/api";
import { sessionRows } from "@renderer/routes/-utils/session-rows";
import { useAgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import { useChosenProjects } from "@renderer/routes/-utils/use-chosen-projects";
import { useSessions } from "@renderer/routes/-utils/use-sessions";
import { MobileSurfaceProvider } from "@renderer/routes/mobile/-utils/mobile-surface-context";

export const Route = createFileRoute("/mobile")({ component: MobileSurface });

function MobileSurface() {
	const projects = useQuery(orpc.projects.list.queryOptions());
	const availableProjects = projects.data ?? [];
	const activity = useAgentActivities(availableProjects.map((project) => project.id));
	const sessions = useSessions();
	const chosen = useChosenProjects();
	const rows = useMemo(
		() =>
			sessionRows({
				continuity: sessions.continuity,
				projects: availableProjects,
				shellActivity: activity.shells,
				traces: activity.traces,
				traceSince: activity.traceSince,
				statusSince: activity.statusSince,
			}),
		[
			sessions.continuity,
			availableProjects,
			activity.shells,
			activity.traces,
			activity.traceSince,
			activity.statusSince,
		],
	);
	const surface = useMemo(
		() => ({
			projects: availableProjects,
			rows,
			chosenProjectIds: chosen.projectIds,
			onToggleProject: chosen.toggle,
		}),
		[availableProjects, rows, chosen.projectIds, chosen.toggle],
	);

	return (
		<MobileSurfaceProvider surface={surface}>
			<Outlet />
		</MobileSurfaceProvider>
	);
}
