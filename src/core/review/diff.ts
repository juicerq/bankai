export type DiffRow =
	| { kind: "context"; line: number; text: string }
	| { kind: "add"; line: number; text: string }
	| { kind: "replace"; line: number; text: string }
	| { kind: "remove"; text: string }
	| { kind: "removed"; count: number }
	| { kind: "skipped"; count: number; line: number };

type Op = { type: "keep" | "add" | "del"; text: string };

// Past this many lines the line-by-line alignment is skipped and every line falls back to
// an addition, so a huge generated file can't stall the render with an O(m*n) table.
const DIFF_CAP_LINES = 3000;

const CONTEXT_LINES = 3;

function collapseContext(rows: DiffRow[]): DiffRow[] {
	const out: DiffRow[] = [];
	let i = 0;

	while (i < rows.length) {
		if (rows[i]!.kind !== "context") {
			out.push(rows[i]!);
			i++;
			continue;
		}

		let end = i;
		while (end < rows.length && rows[end]!.kind === "context") {
			end++;
		}

		const run = rows.slice(i, end);
		const keepStart = i === 0 ? 0 : CONTEXT_LINES;
		const keepEnd = end === rows.length ? 0 : CONTEXT_LINES;
		const hidden = run.length - keepStart - keepEnd;
		const firstHidden = run[keepStart];

		if (hidden < 2 || firstHidden?.kind !== "context") {
			out.push(...run);
		} else {
			out.push(...run.slice(0, keepStart));
			out.push({ kind: "skipped", count: hidden, line: firstHidden.line });
			out.push(...run.slice(run.length - keepEnd));
		}

		i = end;
	}

	return out;
}

function align(before: string[], after: string[]): Op[] {
	const m = before.length;
	const n = after.length;
	const w = n + 1;
	const dp = new Uint16Array((m + 1) * w);

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i * w + j] =
				before[i - 1] === after[j - 1]
					? dp[(i - 1) * w + (j - 1)]! + 1
					: Math.max(dp[(i - 1) * w + j]!, dp[i * w + (j - 1)]!);
		}
	}

	const ops: Op[] = [];
	let i = m;
	let j = n;
	while (i > 0 && j > 0) {
		if (before[i - 1] === after[j - 1]) {
			ops.push({ type: "keep", text: after[j - 1]! });
			i--;
			j--;
		} else if (dp[(i - 1) * w + j]! >= dp[i * w + (j - 1)]!) {
			ops.push({ type: "del", text: before[i - 1]! });
			i--;
		} else {
			ops.push({ type: "add", text: after[j - 1]! });
			j--;
		}
	}

	while (i > 0) {
		ops.push({ type: "del", text: before[i - 1]! });
		i--;
	}

	while (j > 0) {
		ops.push({ type: "add", text: after[j - 1]! });
		j--;
	}

	return ops.toReversed();
}

const opsByAfter = new WeakMap<string[], Map<string[], Op[]>>();

function alignCached(before: string[], after: string[]): Op[] {
	let byBefore = opsByAfter.get(after);
	if (!byBefore) {
		byBefore = new Map();
		opsByAfter.set(after, byBefore);
	}

	let ops = byBefore.get(before);
	if (!ops) {
		ops = align(before, after);
		byBefore.set(before, ops);
	}

	return ops;
}

export function warmDiff(before: string[], after: string[]) {
	if (before.length > DIFF_CAP_LINES || after.length > DIFF_CAP_LINES) {
		return;
	}

	alignCached(before, after);
}

export function diffRows(before: string[], after: string[], folded: boolean): DiffRow[] {
	if (before.length > DIFF_CAP_LINES || after.length > DIFF_CAP_LINES) {
		return after.map((text, i) => ({ kind: "add", line: i + 1, text }));
	}

	const rows: DiffRow[] = [];
	let afterLine = 0;
	let removed = 0;
	let added: { line: number; text: string }[] = [];

	const flush = () => {
		for (const add of added) {
			rows.push({ kind: removed > 0 ? "replace" : "add", line: add.line, text: add.text });
		}

		if (removed > added.length) {
			rows.push({ kind: "removed", count: removed - added.length });
		}

		removed = 0;
		added = [];
	};

	for (const op of alignCached(before, after)) {
		if (op.type === "del") {
			removed++;
			continue;
		}

		if (op.type === "add") {
			afterLine++;
			added.push({ line: afterLine, text: op.text });
			continue;
		}

		flush();
		afterLine++;
		rows.push({ kind: "context", line: afterLine, text: op.text });
	}

	flush();

	return folded ? collapseContext(rows) : rows;
}

export function unifiedRows(before: string[], after: string[], folded: boolean): DiffRow[] {
	if (before.length > DIFF_CAP_LINES || after.length > DIFF_CAP_LINES) {
		return after.map((text, i) => ({ kind: "add", line: i + 1, text }));
	}

	const rows: DiffRow[] = [];
	let afterLine = 0;
	let removes: string[] = [];
	let adds: { line: number; text: string }[] = [];

	const flush = () => {
		for (const text of removes) {
			rows.push({ kind: "remove", text });
		}

		for (const add of adds) {
			rows.push({ kind: "add", line: add.line, text: add.text });
		}

		removes = [];
		adds = [];
	};

	for (const op of alignCached(before, after)) {
		if (op.type === "del") {
			removes.push(op.text);
			continue;
		}

		if (op.type === "add") {
			afterLine++;
			adds.push({ line: afterLine, text: op.text });
			continue;
		}

		flush();
		afterLine++;
		rows.push({ kind: "context", line: afterLine, text: op.text });
	}

	flush();

	return folded ? collapseContext(rows) : rows;
}

export function anchorLineAt(rows: DiffRow[], index: number): number | null {
	for (let i = index; i < rows.length; i++) {
		const row = rows[i]!;

		if (row.kind !== "remove" && row.kind !== "removed") {
			return row.line;
		}
	}

	return null;
}

export function rowIndexForLine(rows: DiffRow[], line: number): number | null {
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;

		if (row.kind === "remove" || row.kind === "removed") {
			continue;
		}

		if (row.kind === "skipped") {
			if (line >= row.line && line < row.line + row.count) {
				return i;
			}

			continue;
		}

		if (row.line === line) {
			return i;
		}
	}

	return null;
}

export function diffStats(files: { before: string[]; after: string[] }[]): {
	added: number;
	removed: number;
} {
	let added = 0;
	let removed = 0;

	for (const file of files) {
		if (file.before.length > DIFF_CAP_LINES || file.after.length > DIFF_CAP_LINES) {
			added += file.after.length;
			continue;
		}

		for (const op of alignCached(file.before, file.after)) {
			if (op.type === "add") {
				added++;
			}
			if (op.type === "del") {
				removed++;
			}
		}
	}

	return { added, removed };
}
