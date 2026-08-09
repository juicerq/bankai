export interface PathEntry {
	path: string;
	kind: "file" | "directory";
}

interface RankedPathEntry {
	entry: PathEntry;
	rank: number;
	order: number;
}

interface AsciiPathQuery {
	needle: string;
	codes: number[];
	prefix: number[];
}

export const PATH_SEARCH_LIMIT = 100;

export function pathEntries(paths: string[]): PathEntry[] {
	const directories = new Set<string>();

	for (const path of paths) {
		const segments = path.split("/");
		segments.pop();

		let prefix = "";
		for (const segment of segments) {
			prefix = prefix ? `${prefix}/${segment}` : segment;
			directories.add(prefix);
		}
	}

	const entries: PathEntry[] = [
		...[...directories].map((path) => ({ path, kind: "directory" as const })),
		...paths.map((path) => ({ path, kind: "file" as const })),
	];

	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function searchPaths(entries: PathEntry[], term: string) {
	const needle = term.trim().toLowerCase();

	if (needle.length === 0) {
		return { total: entries.length, entries: entries.slice(0, PATH_SEARCH_LIMIT) };
	}

	const query = prepareAsciiQuery(needle);
	const best: RankedPathEntry[] = [];
	let total = 0;

	for (const [order, entry] of entries.entries()) {
		const rank = query ? asciiPathRank(entry.path, query) : pathRank(entry.path.toLowerCase(), needle);

		if (rank === undefined) {
			continue;
		}

		total += 1;
		insertBest(best, { entry, rank, order });
	}

	return { total, entries: best.map((match) => match.entry) };
}

function compareMatches(
	left: RankedPathEntry,
	right: RankedPathEntry,
): number {
	if (left.rank !== right.rank) {
		return left.rank - right.rank;
	}

	if (left.entry.kind !== right.entry.kind) {
		if (left.entry.kind === "file") {
			return -1;
		}

		return 1;
	}

	if (left.entry.path.length !== right.entry.path.length) {
		return left.entry.path.length - right.entry.path.length;
	}

	return left.entry.path.localeCompare(right.entry.path) || left.order - right.order;
}

function insertBest(best: RankedPathEntry[], candidate: RankedPathEntry) {
	const worst = best.at(-1);

	if (best.length === PATH_SEARCH_LIMIT && worst && compareMatches(candidate, worst) >= 0) {
		return;
	}

	let low = 0;
	let high = best.length;

	while (low < high) {
		const middle = (low + high) >>> 1;
		const match = best[middle];

		if (match === undefined) {
			return;
		}

		if (compareMatches(candidate, match) < 0) {
			high = middle;
		} else {
			low = middle + 1;
		}
	}

	best.splice(low, 0, candidate);

	if (best.length > PATH_SEARCH_LIMIT) {
		best.pop();
	}
}

function prepareAsciiQuery(needle: string): AsciiPathQuery | undefined {
	const codes: number[] = [];

	for (let index = 0; index < needle.length; index += 1) {
		const code = needle.charCodeAt(index);

		if (code > 127) {
			return;
		}

		codes.push(code);
	}

	const prefix = Array.from<number>({ length: codes.length }).fill(0);

	for (let index = 1, matched = 0; index < codes.length; index += 1) {
		while (matched > 0 && codes[index] !== codes[matched]) {
			const fallback = prefix[matched - 1];

			if (fallback === undefined) {
				return;
			}

			matched = fallback;
		}

		if (codes[index] === codes[matched]) {
			matched += 1;
		}

		prefix[index] = matched;
	}

	return { needle, codes, prefix };
}

function asciiPathRank(path: string, query: AsciiPathQuery) {
	const nameStart = path.lastIndexOf("/") + 1;
	const nameRank = scanAscii(path, nameStart, path.length, query);

	if (nameRank === "unicode") {
		return pathRank(path.toLowerCase(), query.needle);
	}

	if (nameRank !== undefined) {
		return nameRank;
	}

	const fullPathRank = scanAscii(path, 0, path.length, query);

	if (fullPathRank === "unicode") {
		return pathRank(path.toLowerCase(), query.needle);
	}

	if (fullPathRank === 0) {
		return 2;
	}

	if (fullPathRank === 1) {
		return 3;
	}

	return;
}

function scanAscii(path: string, start: number, end: number, query: AsciiPathQuery) {
	let contains = 0;
	let sequence = 0;

	for (let index = start; index < end; index += 1) {
		const code = path.charCodeAt(index);

		if (code > 127) {
			return "unicode" as const;
		}

		const character = asciiLowerCode(code);

		if (character === query.codes[sequence]) {
			sequence += 1;
		}

		while (contains > 0 && character !== query.codes[contains]) {
			const fallback = query.prefix[contains - 1];

			if (fallback === undefined) {
				return;
			}

			contains = fallback;
		}

		if (character === query.codes[contains]) {
			contains += 1;
		}

		if (contains === query.codes.length) {
			return 0;
		}
	}

	if (sequence === query.codes.length) {
		return 1;
	}

	return;
}

function asciiLowerCode(code: number) {
	if (code >= 65 && code <= 90) {
		return code + 32;
	}

	return code;
}

function pathRank(path: string, term: string) {
	const name = path.slice(path.lastIndexOf("/") + 1);

	if (name.includes(term)) {
		return 0;
	}

	if (isSubsequence(name, term)) {
		return 1;
	}

	if (path.includes(term)) {
		return 2;
	}

	if (isSubsequence(path, term)) {
		return 3;
	}

	return;
}

function isSubsequence(haystack: string, needle: string) {
	let index = 0;

	for (const character of haystack) {
		if (character === needle[index]) {
			index += 1;
		}
	}

	return index === needle.length;
}
