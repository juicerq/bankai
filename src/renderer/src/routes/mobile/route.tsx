import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { orpc } from "@renderer/lib/api";
import { useAgentActivities } from "@renderer/routes/-utils/use-agent-activity";
import { useChosenProjects } from "@renderer/routes/-utils/use-chosen-projects";
import { useSessionRows } from "@renderer/routes/-utils/use-session-rows";
import { useSessions } from "@renderer/routes/-utils/use-sessions";
import { MobileSurfaceProvider } from "@renderer/routes/mobile/-utils/mobile-surface-context";

export const Route = createFileRoute("/mobile")({ component: MobileSurface });

function MobileSurface() {
	const projects = useQuery(orpc.projects.list.queryOptions());
	const availableProjects = projects.data ?? [];
	const activity = useAgentActivities(availableProjects.map((project) => project.id));
	const sessions = useSessions();
	const chosen = useChosenProjects();
	const rows = useSessionRows({ continuity: sessions.continuity, projects: availableProjects, activity });
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
