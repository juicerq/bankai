import { useCallback, useMemo, useState } from "react";
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

	const listing = useMemo(() => {
		const sections = partitionSessions(rows, now);
		const listed = (row: SessionRow) => includesProject(row.projectId);

		return {
			open: searchSessions(sections.open.filter(listed), term),
			archived: searchSessions(sections.archived.filter(listed), term),
			openProjectIds: new Set(sections.open.map((row) => row.projectId)),
			waiting: sections.open.find((row) => row.activity === "needs-attention"),
		};
	}, [includesProject, now, rows, term]);
	const searching = term.trim().length > 0;
	const shelfOpen = archivedOpen || searching;
	const numbered = useMemo(
		() => [...listing.open, ...(shelfOpen ? listing.archived : [])].slice(0, NUMBERED_SESSION_LIMIT),
		[listing.archived, listing.open, shelfOpen],
	);

	return {
		...listing,
		numbered,
		archivedOpen: shelfOpen,
		toggleArchived,
		term,
		searching,
		onSearch: setTerm,
	};
}
