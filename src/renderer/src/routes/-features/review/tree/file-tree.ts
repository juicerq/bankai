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
	depth = 0,
): { node: FileTreeNode<T>; depth: number }[] {
	return nodes.flatMap((node) => {
		if (node.kind === "file" || collapsed.has(node.path)) {
			return [{ node, depth }];
		}

		return [{ node, depth }, ...fileTreeRows(node.children, collapsed, depth + 1)];
	});
}

export function fileTreeDirectories<T>(nodes: FileTreeNode<T>[]): string[] {
	return nodes.flatMap((node) => (node.kind === "file" ? [] : [node.path, ...fileTreeDirectories(node.children)]));
}

export function fileTreePaths<T>(node: FileTreeDirectory<T>): string[] {
	return node.children.flatMap((child) => (child.kind === "file" ? [child.path] : fileTreePaths(child)));
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
