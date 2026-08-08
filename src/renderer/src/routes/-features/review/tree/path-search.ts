export interface PathEntry {
	path: string;
	kind: "file" | "directory";
}

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

export function searchPaths(entries: PathEntry[], term: string): PathEntry[] {
	const needle = term.trim().toLowerCase();

	if (needle.length === 0) {
		return entries;
	}

	return entries
		.flatMap((entry) => {
			const rank = pathRank(entry.path.toLowerCase(), needle);
			if (rank === undefined) {
				return [];
			}

			return [{ entry, rank }];
		})
		.sort((left, right) => compareMatches(left, right))
		.map((match) => match.entry);
}

function compareMatches(
	left: { entry: PathEntry; rank: number },
	right: { entry: PathEntry; rank: number },
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

	return left.entry.path.localeCompare(right.entry.path);
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
