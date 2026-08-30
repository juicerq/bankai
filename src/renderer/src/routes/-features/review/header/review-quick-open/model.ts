import type { SearchMatch } from "@shared/review";
import {
	PATH_SEARCH_LIMIT,
	type PathEntry,
} from "@renderer/routes/-features/review/tree/path-search";

export const VISIBLE_MATCHES = PATH_SEARCH_LIMIT;

export interface QuickOpenPath {
	kind: "path";
	key: string;
	entry: PathEntry;
}

export interface QuickOpenMatch {
	kind: "match";
	key: string;
	match: SearchMatch;
}

export type QuickOpenChoice = QuickOpenPath | QuickOpenMatch;

export type QuickOpenSearchStatus = "searching" | "error" | "empty" | "truncated" | "results";

export function searchStatus({
	isFetching,
	isError,
	matches,
	truncated,
}: {
	isFetching: boolean;
	isError: boolean;
	matches?: SearchMatch[];
	truncated?: boolean;
}): QuickOpenSearchStatus {
	if (isFetching && !matches?.length) {
		return "searching";
	}
	if (isError) {
		return "error";
	}
	if (truncated) {
		return "truncated";
	}
	if (matches?.length === 0) {
		return "empty";
	}

	return "results";
}

export function groupMatches(matches: SearchMatch[]) {
	const groups = new Map<string, QuickOpenMatch[]>();
	for (const [index, match] of matches.entries()) {
		const item: QuickOpenMatch = { kind: "match", key: `match:${match.file}:${match.line}:${index}`, match };
		const group = groups.get(match.file);
		if (group) {
			group.push(item);
			continue;
		}

		groups.set(match.file, [item]);
	}

	return [...groups].map(([path, group]) => ({ path, matches: group }));
}
