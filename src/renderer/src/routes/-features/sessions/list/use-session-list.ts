import { useCallback, useState } from "react";
import { partitionSessions, type SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";

const NUMBERED_SESSION_LIMIT = 9;

export function useSessionList({
	rows,
	now,
	projectIds,
}: {
	rows: SessionRow[];
	now: number;
	projectIds: ReadonlySet<string>;
}) {
	const [archivedOpen, setArchivedOpen] = useState(false);
	const toggleArchived = useCallback(() => setArchivedOpen((open) => !open), []);

	const sections = partitionSessions(rows, now);
	const open = onlyChosen(sections.open, projectIds);
	const archived = onlyChosen(sections.archived, projectIds);
	const numbered = [...open, ...(archivedOpen ? archived : [])].slice(0, NUMBERED_SESSION_LIMIT);

	return {
		open,
		archived,
		numbered,
		openProjectIds: new Set(sections.open.map((row) => row.projectId)),
		waiting: sections.open.find((row) => row.activity === "needs-attention"),
		archivedOpen,
		toggleArchived,
	};
}

function onlyChosen(rows: SessionRow[], projectIds: ReadonlySet<string>): SessionRow[] {
	if (projectIds.size === 0) {
		return rows;
	}

	return rows.filter((row) => projectIds.has(row.projectId));
}
