import { readFile } from "node:fs/promises";

export type ClaudeEdit = {
	path: string;
	oldString: string;
	newString: string;
	replaceAll: boolean;
};

export type FileItem =
	| { edit: ClaudeEdit }
	| { change: { path: string; before: string } };

type FileSnapshot = { path: string; before: string; after: string };

function reversedEdit(after: string, edit: ClaudeEdit): string | null {
	if (!edit.newString) {
		return null;
	}

	if (edit.replaceAll) {
		const before = after.replaceAll(edit.newString, () => edit.oldString);
		return before.replaceAll(edit.oldString, () => edit.newString) === after ? before : null;
	}

	let reversed: string | null = null;
	for (
		let index = after.indexOf(edit.newString);
		index !== -1;
		index = after.indexOf(edit.newString, index + 1)
	) {
		const candidate = after.slice(0, index)
			+ edit.oldString
			+ after.slice(index + edit.newString.length);
		if (candidate.replace(edit.oldString, () => edit.newString) !== after) {
			continue;
		}
		if (reversed !== null && reversed !== candidate) {
			return null;
		}

		reversed = candidate;
	}

	return reversed;
}

export async function materializedEdits(
	items: FileItem[],
): Promise<Map<ClaudeEdit, FileSnapshot> | null> {
	const byPath = new Map<string, FileItem[]>();
	for (const item of items) {
		const path = "edit" in item ? item.edit.path : item.change.path;
		const related = byPath.get(path) ?? [];
		related.push(item);
		byPath.set(path, related);
	}

	const materialized = await Promise.all([...byPath].map(async ([path, related]) => {
		let state: string | null = null;
		const pathSnapshots: [ClaudeEdit, FileSnapshot][] = [];
		for (const item of related.toReversed()) {
			if ("change" in item) {
				state = item.change.before;
				continue;
			}

			const after = state ?? await readFile(path, "utf8").catch(() => null);
			if (after === null) {
				return null;
			}

			const before = reversedEdit(after, item.edit);
			if (before === null) {
				return null;
			}

			pathSnapshots.push([item.edit, { path, before, after }]);
			state = before;
		}
		return pathSnapshots;
	}));

	const snapshots = new Map<ClaudeEdit, FileSnapshot>();
	for (const pathSnapshots of materialized) {
		if (!pathSnapshots) {
			return null;
		}
		for (const [edit, snapshot] of pathSnapshots) {
			snapshots.set(edit, snapshot);
		}
	}

	return snapshots;
}
