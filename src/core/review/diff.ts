import { lineDiff, type LineDiffOp } from "@core/review/lineDiff";

export type DiffRow =
	| { kind: "context"; line: number; text: string }
	| { kind: "add"; line: number; text: string }
	| { kind: "replace"; line: number; text: string }
	| { kind: "remove"; text: string }
	| { kind: "removed"; count: number }
	| { kind: "skipped"; count: number; line: number }
	| { kind: "too-large"; beforeCount: number; afterCount: number };

export type DiffStats =
	| { state: "exact"; added: number; removed: number }
	| { state: "too-large" };

const CONTEXT_LINES = 3;

function collapseContext(rows: DiffRow[]): DiffRow[] {
	const collapsed: DiffRow[] = [];
	let index = 0;

	while (index < rows.length) {
		if (rows[index]?.kind !== "context") {
			const row = rows[index];
			if (row) {
				collapsed.push(row);
			}
			index++;
			continue;
		}

		let end = index;
		while (rows[end]?.kind === "context") {
			end++;
		}

		const run = rows.slice(index, end);
		const keepStart = index === 0 ? 0 : CONTEXT_LINES;
		const keepEnd = end === rows.length ? 0 : CONTEXT_LINES;
		const hidden = run.length - keepStart - keepEnd;
		const firstHidden = run[keepStart];

		if (hidden < 2 || firstHidden?.kind !== "context") {
			collapsed.push(...run);
		} else {
			collapsed.push(...run.slice(0, keepStart));
			collapsed.push({
				kind: "skipped",
				count: hidden,
				line: firstHidden.line,
			});
			collapsed.push(...run.slice(run.length - keepEnd));
		}

		index = end;
	}

	return collapsed;
}

function rowsFromOperations(
	operations: LineDiffOp[],
	mode: "compact" | "unified",
): DiffRow[] {
	const rows: DiffRow[] = [];
	let afterLine = 0;
	let removals: string[] = [];
	let additions: { line: number; text: string }[] = [];

	const flush = () => {
		if (mode === "unified") {
			rows.push(...removals.map((text): DiffRow => ({ kind: "remove", text })));
			rows.push(...additions.map(({ line, text }): DiffRow => ({ kind: "add", line, text })));
		} else {
			rows.push(...additions.map(({ line, text }): DiffRow => ({
				kind: removals.length > 0 ? "replace" : "add",
				line,
				text,
			})));

			const hiddenRemovals = removals.length - additions.length;
			if (hiddenRemovals > 0) {
				rows.push({ kind: "removed", count: hiddenRemovals });
			}
		}

		removals = [];
		additions = [];
	};

	for (const operation of operations) {
		if (operation.type === "delete") {
			removals.push(operation.text);
			continue;
		}
		if (operation.type === "add") {
			afterLine++;
			additions.push({ line: afterLine, text: operation.text });
			continue;
		}

		flush();
		afterLine++;
		rows.push({ kind: "context", line: afterLine, text: operation.text });
	}

	flush();
	return rows;
}

function fileRows(
	before: string[],
	after: string[],
	folded: boolean,
	mode: "compact" | "unified",
): DiffRow[] {
	const result = lineDiff(before, after);
	if (result.state === "too-large") {
		return [{
			kind: "too-large",
			beforeCount: result.beforeCount,
			afterCount: result.afterCount,
		}];
	}

	const rows = rowsFromOperations(result.operations, mode);
	return folded ? collapseContext(rows) : rows;
}

export function diffRows(before: string[], after: string[], folded: boolean): DiffRow[] {
	return fileRows(before, after, folded, "compact");
}

export function unifiedRows(before: string[], after: string[], folded: boolean): DiffRow[] {
	return fileRows(before, after, folded, "unified");
}

export function anchorLineAt(rows: DiffRow[], index: number): number | null {
	for (let cursor = index; cursor < rows.length; cursor++) {
		const row = rows[cursor];
		if (
			row
			&& row.kind !== "remove"
			&& row.kind !== "removed"
			&& row.kind !== "too-large"
		) {
			return row.line;
		}
	}

	return null;
}

export function rowIndexForLine(rows: DiffRow[], line: number): number | null {
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		if (!row || row.kind === "remove" || row.kind === "removed" || row.kind === "too-large") {
			continue;
		}

		if (row.kind === "skipped") {
			if (line >= row.line && line < row.line + row.count) {
				return index;
			}
			continue;
		}

		if (row.line === line) {
			return index;
		}
	}

	return null;
}

export function diffStats(files: { before: string[]; after: string[] }[]): DiffStats {
	let added = 0;
	let removed = 0;

	for (const file of files) {
		const result = lineDiff(file.before, file.after);
		if (result.state === "too-large") {
			return { state: "too-large" };
		}

		for (const operation of result.operations) {
			if (operation.type === "add") {
				added++;
			}
			if (operation.type === "delete") {
				removed++;
			}
		}
	}

	return { state: "exact", added, removed };
}
