import { useCallback, useState } from "react";
import { partitionSessions, type SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";
import { searchSessions } from "@renderer/routes/-features/sessions/list/session-search";

const NUMBERED_SESSION_LIMIT = 9;

export function useSessionList({
	rows,
	now,
	includesProject,
}: {
	rows: SessionRow[];
	now: number;
	includesProject: (projectId: string) => boolean;
}) {
	const [archivedOpen, setArchivedOpen] = useState(false);
	const [term, setTerm] = useState("");
	const toggleArchived = useCallback(() => setArchivedOpen((open) => !open), []);

	const sections = partitionSessions(rows, now);
	const listed = (row: SessionRow) => includesProject(row.projectId);
	const open = searchSessions(sections.open.filter(listed), term);
	const archived = searchSessions(sections.archived.filter(listed), term);
	const searching = term.trim().length > 0;
	const shelfOpen = archivedOpen || searching;
	const numbered = [...open, ...(shelfOpen ? archived : [])].slice(0, NUMBERED_SESSION_LIMIT);

	return {
		open,
		archived,
		numbered,
		openProjectIds: new Set(sections.open.map((row) => row.projectId)),
		waiting: sections.open.find((row) => row.activity === "needs-attention"),
		archivedOpen: shelfOpen,
		toggleArchived,
		term,
		searching,
		onSearch: setTerm,
	};
}
