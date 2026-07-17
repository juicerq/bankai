import { describe, expect, it } from "vitest";
import { unifiedRows } from "@core/review/diff";

const lines = (text: string) => text === "" ? [] : text.split("\n");

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
		expect(rows.filter((row) => row.kind === "remove")).toEqual([
			{ kind: "remove", text: "l10" },
		]);
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
