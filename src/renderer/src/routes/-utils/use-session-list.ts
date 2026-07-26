import { useCallback, useState } from "react";
import { partitionSessions, type SessionRow } from "@renderer/routes/-utils/session-rows";

const NUMBERED_SESSION_LIMIT = 9;

export function useSessionList(rows: SessionRow[], now: number) {
	const [archivedOpen, setArchivedOpen] = useState(false);
	const toggleArchived = useCallback(() => setArchivedOpen((open) => !open), []);

	const sections = partitionSessions(rows, now);
	const numbered = [...sections.open, ...(archivedOpen ? sections.archived : [])].slice(
		0,
		NUMBERED_SESSION_LIMIT,
	);

	return {
		...sections,
		numbered,
		waiting: sections.open.find((row) => row.activity === "needs-attention"),
		archivedOpen,
		toggleArchived,
	};
}
