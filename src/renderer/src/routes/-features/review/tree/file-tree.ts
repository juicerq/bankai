export interface FileTreeDirectory<T> {
	kind: "directory";
	name: string;
	path: string;
	children: FileTreeNode<T>[];
}

export interface FileTreeLeaf<T> {
	kind: "file";
	name: string;
	path: string;
	item: T;
}

export type FileTreeNode<T> = FileTreeDirectory<T> | FileTreeLeaf<T>;

export interface FileTreeRow<T> {
	node: FileTreeNode<T>;
	depth: number;
}

interface FileTreeQueryPart {
	value: string;
	ascii: boolean;
	characters: string[];
}

interface FileTreeQuery {
	parts: FileTreeQueryPart[];
	directoryOnly: boolean;
}

interface FilteredFileTreeRows<T> {
	rows: FileTreeRow<T>[];
	paths: string[];
	count: number;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function fileTree<T>(leaves: { path: string; item: T }[]): FileTreeNode<T>[] {
	const root: FileTreeDirectory<T> = { kind: "directory", name: "", path: "", children: [] };
	const directories = new Map<string, FileTreeDirectory<T>>();

	for (const leaf of leaves) {
		const segments = leaf.path.split("/");
		let directory = root;

		for (const [index, segment] of segments.entries()) {
			if (index === segments.length - 1) {
				directory.children.push({ kind: "file", name: segment, path: leaf.path, item: leaf.item });
				continue;
			}

			const path = directory.path ? `${directory.path}/${segment}` : segment;
			const existing = directories.get(path);
			if (existing) {
				directory = existing;
				continue;
			}

			const created: FileTreeDirectory<T> = { kind: "directory", name: segment, path, children: [] };
			directories.set(path, created);
			directory.children.push(created);
			directory = created;
		}
	}

	return arrange(root.children);
}

export function fileTreeRows<T>(
	nodes: FileTreeNode<T>[],
	collapsed: ReadonlySet<string>,
): FileTreeRow<T>[] {
	const rows: FileTreeRow<T>[] = [];
	appendFileTreeRows(nodes, collapsed, 0, rows);

	return rows;
}

export function filterFileTreeRows<T>(
	nodes: FileTreeNode<T>[],
	query: string,
	collapsed: ReadonlySet<string>,
): FilteredFileTreeRows<T> {
	const parsed = parseQuery(query);
	const result: FilteredFileTreeRows<T> = { rows: [], paths: [], count: 0 };
	appendFilteredRows(nodes, parsed, collapsed, 0, result);

	return result;
}

export function highlightFileTreeName(name: string, query: string) {
	const parts = parseQuery(query).parts;

	if (parts.length === 0) {
		return [];
	}

	const highlighted = new Set<number>();
	let offset = 0;

	for (const segment of name.split("/")) {
		for (const part of parts) {
			for (const index of matchingCharacters(segment, part) ?? []) {
				highlighted.add(offset + index);
			}
		}

		offset += graphemes(segment).length + 1;
	}

	return graphemes(name).reduce<{ highlighted: boolean; text: string }[]>((runs, character, index) => {
		const matching = highlighted.has(index);
		const previous = runs.at(-1);

		if (previous?.highlighted === matching) {
			previous.text += character;
			return runs;
		}

		runs.push({ highlighted: matching, text: character });
		return runs;
	}, []);
}

export function fileTreeDirectories<T>(nodes: FileTreeNode<T>[]): string[] {
	return nodes.flatMap((node) => (node.kind === "file" ? [] : [node.path, ...fileTreeDirectories(node.children)]));
}

export function fileTreePaths<T>(nodes: FileTreeNode<T>[]): string[] {
	return nodes.flatMap((node) => (node.kind === "file" ? [node.path] : fileTreePaths(node.children)));
}

function arrange<T>(nodes: FileTreeNode<T>[]): FileTreeNode<T>[] {
	return nodes.map((node) => (node.kind === "file" ? node : collapseChain(node))).sort(byDirectoryThenName);
}

function byDirectoryThenName<T>(a: FileTreeNode<T>, b: FileTreeNode<T>): number {
	if (a.kind === b.kind) {
		return a.name.localeCompare(b.name);
	}

	if (a.kind === "directory") {
		return -1;
	}

	return 1;
}

function collapseChain<T>(node: FileTreeDirectory<T>): FileTreeDirectory<T> {
	const only = node.children.length === 1 ? node.children[0] : undefined;
	if (only?.kind === "directory") {
		const merged = collapseChain(only);

		return { ...merged, name: `${node.name}/${merged.name}` };
	}

	return { ...node, children: arrange(node.children) };
}

function parseQuery(query: string): FileTreeQuery {
	const normalized = query.trim().toLowerCase();
	const values = normalized.split("/").filter((part) => part.length > 0);

	return {
		parts: values.map((value) => ({ value, ascii: isAscii(value), characters: graphemes(value) })),
		directoryOnly: normalized.endsWith("/"),
	};
}

function appendFileTreeRows<T>(
	nodes: FileTreeNode<T>[],
	collapsed: ReadonlySet<string>,
	depth: number,
	rows: FileTreeRow<T>[],
) {
	for (const node of nodes) {
		rows.push({ node, depth });

		if (node.kind === "directory" && !collapsed.has(node.path)) {
			appendFileTreeRows(node.children, collapsed, depth + 1, rows);
		}
	}
}

function appendFilteredRows<T>(
	nodes: FileTreeNode<T>[],
	query: FileTreeQuery,
	collapsed: ReadonlySet<string>,
	depth: number,
	result: FilteredFileTreeRows<T>,
) {
	let matchedRoots = 0;
	for (const node of nodes) {
		if (node.kind === "file") {
			if (matchesPath(node.path, query)) {
				result.rows.push({ node, depth });
				result.paths.push(node.path);
				result.count += 1;
				matchedRoots += 1;
			}

			continue;
		}

		const rowStart = result.rows.length;
		const pathStart = result.paths.length;
		const countStart = result.count;
		result.rows.push({ node, depth });
		const matchedChildren = appendFilteredRows(node.children, query, collapsed, depth + 1, result);

		if (result.count === countStart) {
			result.rows.length = rowStart;
			result.paths.length = pathStart;
			continue;
		}

		matchedRoots += 1;
		const onlyChild = matchedChildren === 1 ? result.rows[rowStart + 1] : undefined;
		if (onlyChild?.node.kind === "directory") {
			result.rows[rowStart] = {
				node: { ...onlyChild.node, name: `${node.name}/${onlyChild.node.name}` },
				depth,
			};
			result.rows.splice(rowStart + 1, 1);

			for (let index = rowStart + 1; index < result.rows.length; index += 1) {
				const row = result.rows[index];
				if (row) {
					row.depth -= 1;
				}
			}
		}

		const directory = result.rows[rowStart];
		if (directory && collapsed.has(directory.node.path)) {
			result.rows.length = rowStart + 1;
			result.paths.length = pathStart;
		}
	}

	return matchedRoots;
}

function matchesPath(path: string, query: FileTreeQuery) {
	const pathEnd = query.directoryOnly ? path.lastIndexOf("/") : path.length;
	let candidateStart = 0;

	for (const part of query.parts) {
		let found = false;

		while (candidateStart < pathEnd) {
			const separator = path.indexOf("/", candidateStart);
			const candidateEnd = separator < 0 || separator > pathEnd ? pathEnd : separator;

			if (matchesRange(path, candidateStart, candidateEnd, part)) {
				candidateStart = candidateEnd + 1;
				found = true;
				break;
			}

			candidateStart = candidateEnd + 1;
		}

		if (!found) {
			return false;
		}
	}

	return true;
}

function matchesRange(path: string, start: number, end: number, part: FileTreeQueryPart) {
	if (!part.ascii) {
		return matchesUnicode(path.slice(start, end), part.characters);
	}

	let matched = 0;

	for (let index = start; index < end; index += 1) {
		const code = path.charCodeAt(index);

		if (code > 127) {
			return matchesUnicode(path.slice(start, end), part.characters);
		}

		if (asciiLowerCode(code) === part.value.charCodeAt(matched)) {
			matched += 1;

			if (matched === part.value.length) {
				return true;
			}
		}
	}

	return false;
}

function matchingCharacters(value: string, part: FileTreeQueryPart) {
	const matches: number[] = [];

	for (const [index, character] of graphemes(value).entries()) {
		if (character.toLowerCase() === part.characters[matches.length]) {
			matches.push(index);
		}
	}

	if (matches.length !== part.characters.length) {
		return;
	}

	return matches;
}

function matchesUnicode(value: string, characters: string[]) {
	let matched = 0;

	for (const character of graphemes(value)) {
		if (character.toLowerCase() === characters[matched]) {
			matched += 1;

			if (matched === characters.length) {
				return true;
			}
		}
	}

	return false;
}

function asciiLowerCode(code: number) {
	if (code >= 65 && code <= 90) {
		return code + 32;
	}

	return code;
}

function isAscii(value: string) {
	for (let index = 0; index < value.length; index += 1) {
		if (value.charCodeAt(index) > 127) {
			return false;
		}
	}

	return true;
}

function graphemes(value: string) {
	return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}
