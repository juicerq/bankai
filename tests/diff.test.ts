import { describe, expect, it } from "vitest";
import { anchorLineAt, diffRows, diffStats, rowIndexForLine, unifiedRows } from "@core/review/diff";

const lines = (text: string) => (text === "" ? [] : text.split("\n"));

describe("diffRows", () => {
	it("marks a brand-new file as all additions", () => {
		expect(diffRows([], lines("a\nb"), true)).toEqual([
			{ kind: "add", line: 1, text: "a" },
			{ kind: "add", line: 2, text: "b" },
		]);
	});

	it("marks appended lines as pure additions and keeps prior lines as context", () => {
		expect(diffRows(lines("a\nb"), lines("a\nb\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "context", line: 2, text: "b" },
			{ kind: "add", line: 3, text: "c" },
		]);
	});

	it("marks a changed line as a replacement, not a plain add", () => {
		expect(diffRows(lines("a\nb\nc"), lines("a\nB\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "replace", line: 2, text: "B" },
			{ kind: "context", line: 3, text: "c" },
		]);
	});

	it("surfaces a purely deleted line as a removed marker at its position", () => {
		expect(diffRows(lines("a\nguard\nc"), lines("a\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "removed", count: 1 },
			{ kind: "context", line: 2, text: "c" },
		]);
	});

	it("counts consecutive pure deletions into a single marker", () => {
		expect(diffRows(lines("a\nx\ny\nz\nc"), lines("a\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "removed", count: 3 },
			{ kind: "context", line: 2, text: "c" },
		]);
	});

	it("shows a replacement plus a trailing marker when more lines are removed than added", () => {
		expect(diffRows(lines("a\nx\ny\nz\nc"), lines("a\nw\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "replace", line: 2, text: "w" },
			{ kind: "removed", count: 2 },
			{ kind: "context", line: 3, text: "c" },
		]);
	});

	it("collapses context beyond 3 lines around a change into a skipped marker", () => {
		const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const after = [...before];
		after[9] = "CHANGED";

		expect(diffRows(before, after, true)).toEqual([
			{ kind: "skipped", count: 6, line: 1 },
			{ kind: "context", line: 7, text: "l7" },
			{ kind: "context", line: 8, text: "l8" },
			{ kind: "context", line: 9, text: "l9" },
			{ kind: "replace", line: 10, text: "CHANGED" },
			{ kind: "context", line: 11, text: "l11" },
			{ kind: "context", line: 12, text: "l12" },
			{ kind: "context", line: 13, text: "l13" },
			{ kind: "skipped", count: 7, line: 14 },
		]);
	});

	it("keeps every context line when unfolded", () => {
		const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const after = [...before];
		after[9] = "CHANGED";

		const rows = diffRows(before, after, false);

		expect(rows).toHaveLength(20);
		expect(rows.some((row) => row.kind === "skipped")).toBe(false);
		expect(rows[0]).toEqual({ kind: "context", line: 1, text: "l1" });
		expect(rows[9]).toEqual({ kind: "replace", line: 10, text: "CHANGED" });
		expect(rows.at(-1)).toEqual({ kind: "context", line: 20, text: "l20" });
	});

	it("merges two nearby changes into a single hunk", () => {
		const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const after = [...before];
		after[7] = "FIRST";
		after[11] = "SECOND";

		const rows = diffRows(before, after, true);
		const skips = rows.filter((row) => row.kind === "skipped");

		expect(skips).toEqual([
			{ kind: "skipped", count: 4, line: 1 },
			{ kind: "skipped", count: 5, line: 16 },
		]);
		expect(rows.filter((row) => row.kind === "context")).toHaveLength(9);
	});

	it("keeps short context runs instead of hiding a single line", () => {
		const before = Array.from({ length: 8 }, (_, i) => `l${i + 1}`);
		const after = [...before];
		after[3] = "CHANGED";

		expect(diffRows(before, after, true).every((row) => row.kind !== "skipped")).toBe(true);
	});

	it("collapses an untouched file into a single skipped marker", () => {
		const lines20 = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);

		expect(diffRows(lines20, [...lines20], true)).toEqual([
			{ kind: "skipped", count: 20, line: 1 },
		]);
	});

	it("falls back to all additions past the diff cap", () => {
		const before = Array.from({ length: 3001 }, (_, i) => `l${i}`);
		const after = [...before, "l3001"];

		const rows = diffRows(before, after, true);
		expect(rows).toHaveLength(3002);
		expect(rows.every((row) => row.kind === "add")).toBe(true);
	});

	it("keeps independent results for two befores sharing the same after", () => {
		const after = lines("a\nb\nc");
		const turnBefore = lines("a\nc");
		const sessionBefore = lines("c");

		const turnRows = diffRows(turnBefore, after, true);
		const sessionRows = diffRows(sessionBefore, after, true);

		expect(turnRows).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "add", line: 2, text: "b" },
			{ kind: "context", line: 3, text: "c" },
		]);
		expect(sessionRows).toEqual([
			{ kind: "add", line: 1, text: "a" },
			{ kind: "add", line: 2, text: "b" },
			{ kind: "context", line: 3, text: "c" },
		]);
		expect(diffRows(turnBefore, after, true)).toEqual(turnRows);
	});
});

describe("unifiedRows", () => {
	it("keeps a deleted line in place with its text", () => {
		expect(unifiedRows(lines("a\nguard\nc"), lines("a\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "remove", text: "guard" },
			{ kind: "context", line: 2, text: "c" },
		]);
	});

	it("shows a change as the removed old line then the added new line", () => {
		expect(unifiedRows(lines("a\nb\nc"), lines("a\nB\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "remove", text: "b" },
			{ kind: "add", line: 2, text: "B" },
			{ kind: "context", line: 3, text: "c" },
		]);
	});

	it("numbers added lines by their position in the after snapshot", () => {
		expect(unifiedRows(lines("a\nb"), lines("a\nb\nc"), true)).toEqual([
			{ kind: "context", line: 1, text: "a" },
			{ kind: "context", line: 2, text: "b" },
			{ kind: "add", line: 3, text: "c" },
		]);
	});

	it("collapses context around the change like the compact view", () => {
		const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const after = [...before];
		after[9] = "CHANGED";

		const rows = unifiedRows(before, after, true);

		expect(rows[0]).toEqual({ kind: "skipped", count: 6, line: 1 });
		expect(rows.at(-1)).toEqual({ kind: "skipped", count: 7, line: 14 });
		expect(rows.filter((row) => row.kind === "remove")).toEqual([{ kind: "remove", text: "l10" }]);
	});

	it("keeps every context line and inline removals when unfolded", () => {
		const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
		const after = [...before];
		after[9] = "CHANGED";

		const rows = unifiedRows(before, after, false);

		expect(rows).toHaveLength(21);
		expect(rows.some((row) => row.kind === "skipped")).toBe(false);
		expect(rows[0]).toEqual({ kind: "context", line: 1, text: "l1" });
		expect(rows[9]).toEqual({ kind: "remove", text: "l10" });
		expect(rows.at(-1)).toEqual({ kind: "context", line: 20, text: "l20" });
	});
});

describe("anchorLineAt", () => {
	const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
	const after = [...before];
	after[9] = "CHANGED";
	const folded = diffRows(before, after, true);

	it("returns the line of a line-bearing row", () => {
		expect(anchorLineAt(folded, 1)).toBe(7);
	});

	it("returns the first hidden line for a skipped marker", () => {
		expect(anchorLineAt(folded, 0)).toBe(1);
		expect(anchorLineAt(folded, 8)).toBe(14);
	});

	it("walks past removed markers to the next numbered row", () => {
		const rows = diffRows(lines("a\nguard\nc"), lines("a\nc"), true);

		expect(anchorLineAt(rows, 1)).toBe(2);
	});

	it("walks past inline remove rows to the next numbered row", () => {
		const rows = unifiedRows(lines("a\nb\nc"), lines("a\nB\nc"), true);

		expect(anchorLineAt(rows, 1)).toBe(2);
	});

	it("returns null when only removed rows remain", () => {
		const rows = diffRows(lines("a\nx"), lines("a"), true);

		expect(anchorLineAt(rows, 1)).toBeNull();
	});
});

describe("rowIndexForLine", () => {
	const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
	const after = [...before];
	after[9] = "CHANGED";
	const folded = diffRows(before, after, true);
	const full = diffRows(before, after, false);

	it("finds the exact row of a visible line", () => {
		expect(rowIndexForLine(folded, 8)).toBe(2);
		expect(rowIndexForLine(full, 8)).toBe(7);
	});

	it("resolves a line hidden inside a skipped marker to that marker", () => {
		expect(rowIndexForLine(folded, 3)).toBe(0);
		expect(rowIndexForLine(folded, 17)).toBe(8);
	});

	it("skips remove rows while scanning", () => {
		const rows = unifiedRows(lines("a\nb\nc"), lines("a\nB\nc"), true);

		expect(rowIndexForLine(rows, 2)).toBe(2);
	});

	it("returns null for a line beyond the rows", () => {
		expect(rowIndexForLine(folded, 21)).toBeNull();
	});
});

describe("diffStats", () => {
	it("sums additions and deletions across files", () => {
		const files = [
			{ before: lines("a\nb\nc"), after: lines("a\nB\nc\nd") },
			{ before: lines("x"), after: [] },
		];

		expect(diffStats(files)).toEqual({ added: 2, removed: 2 });
	});

	it("returns zeros for an untouched file", () => {
		expect(diffStats([{ before: lines("a\nb"), after: lines("a\nb") }])).toEqual({
			added: 0,
			removed: 0,
		});
	});

	it("counts the cap fallback as all additions", () => {
		const before = Array.from({ length: 3001 }, (_, i) => `l${i}`);

		expect(diffStats([{ before, after: [...before, "x"] }])).toEqual({
			added: 3002,
			removed: 0,
		});
	});
});
