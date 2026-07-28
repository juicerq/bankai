import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { MobileSessionList } from "@renderer/routes/mobile/-components/mobile-session-list";
import { mobileSessionList } from "@renderer/routes/mobile/-utils/mobile-session-list";
import { useMobileSurface } from "@renderer/routes/mobile/-utils/mobile-surface-context";
import { useNewShell } from "@renderer/routes/mobile/-utils/use-new-shell";

export const Route = createFileRoute("/mobile/")({ component: MobileSessions });

function MobileSessions() {
	const surface = useMobileSurface();
	const navigate = useNavigate();
	const createShell = useNewShell();
	const { sessions, projects, projectActivity } = useMemo(
		() =>
			mobileSessionList({
				rows: surface.rows,
				projects: surface.projects,
				chosenProjectIds: surface.chosenProjectIds,
				now: Date.now(),
			}),
		[surface.rows, surface.projects, surface.chosenProjectIds],
	);

	return (
		<MobileSessionList
			sessions={sessions}
			projects={projects}
			projectActivity={projectActivity}
			chosenProjectIds={surface.chosenProjectIds}
			onToggleProject={surface.onToggleProject}
			onOpen={(shellId) => navigate({ to: "/mobile/$shellId", params: { shellId } })}
			onCreate={createShell}
		/>
	);
}
