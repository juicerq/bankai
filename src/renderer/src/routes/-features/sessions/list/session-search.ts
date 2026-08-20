import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";

export function searchSessions(rows: SessionRow[], term: string): SessionRow[] {
	const needle = term.trim().toLowerCase();

	if (needle.length === 0) {
		return rows;
	}

	return rows.filter((row) => rowMatches(row, needle));
}

function rowMatches(row: SessionRow, needle: string): boolean {
	for (const field of [row.title, row.projectName, row.branch]) {
		if (field !== undefined && fieldMatches(field.toLowerCase(), needle)) {
			return true;
		}
	}

	return false;
}

function fieldMatches(haystack: string, needle: string): boolean {
	if (haystack.includes(needle)) {
		return true;
	}

	let index = 0;

	for (const character of haystack) {
		if (character === needle[index]) {
			index += 1;
		}
	}

	return index === needle.length;
}
