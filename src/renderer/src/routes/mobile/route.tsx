import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { orpc } from "@renderer/lib/api";
import { useAgentActivities } from "@renderer/routes/-features/sessions/list/use-agent-activity";
import { useChosenProjects } from "@renderer/routes/-features/projects/use-chosen-projects";
import { useSessionRows } from "@renderer/routes/-features/sessions/list/use-session-rows";
import { useSessions } from "@renderer/routes/-features/sessions/lifecycle/use-sessions";
import { MobileSurfaceProvider } from "@renderer/routes/mobile/-utils/mobile-surface-context";
import { useVisualViewport } from "@renderer/routes/mobile/-utils/use-visual-viewport";

export const Route = createFileRoute("/mobile")({ component: MobileSurface });

function MobileSurface() {
	const projects = useQuery(orpc.projects.list.queryOptions());
	const availableProjects = projects.data ?? [];
	const activity = useAgentActivities(availableProjects.map((project) => project.id));
	const sessions = useSessions();
	const chosen = useChosenProjects();
	const viewport = useVisualViewport();
	const rows = useSessionRows({ continuity: sessions.continuity, projects: availableProjects, activity });
	const surface = useMemo(
		() => ({
			projects: availableProjects,
			rows,
			chosenProjectIds: chosen.projectIds,
			onToggleProject: chosen.toggle,
			onRename: sessions.renameShell,
			onArchive: sessions.archiveShell,
			onUnarchive: sessions.unarchiveShell,
			onPin: sessions.pinShell,
			onUnpin: sessions.unpinShell,
			onCloseSession: sessions.closeShell,
		}),
		[
			availableProjects,
			rows,
			chosen.projectIds,
			chosen.toggle,
			sessions.renameShell,
			sessions.archiveShell,
			sessions.unarchiveShell,
			sessions.pinShell,
			sessions.unpinShell,
			sessions.closeShell,
		],
	);

	return (
		<MobileSurfaceProvider surface={surface}>
			<div ref={viewport} data-component="mobile-surface" className="fixed inset-x-0 top-0 h-dvh">
				<Outlet />
			</div>
		</MobileSurfaceProvider>
	);
}
