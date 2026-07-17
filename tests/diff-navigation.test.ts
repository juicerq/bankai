import { describe, expect, it } from "vitest";
import {
	anchorLineAt,
	diffRows,
	rowIndexForLine,
	unifiedRows,
} from "@core/review/diff";

function lines(text: string): string[] {
	return text === "" ? [] : text.split("\n");
}

const before = Array.from({ length: 20 }, (_, index) => `l${index + 1}`);
const after = [...before];
after[9] = "CHANGED";
const folded = diffRows(before, after, true);
const full = diffRows(before, after, false);

describe("diff row navigation", () => {
	it("anchors line-bearing and skipped rows", () => {
		expect(anchorLineAt(folded, 1)).toBe(7);
		expect(anchorLineAt(folded, 0)).toBe(1);
		expect(anchorLineAt(folded, 8)).toBe(14);
	});

	it("walks past compact and inline removals", () => {
		const compact = diffRows(lines("a\nguard\nc"), lines("a\nc"), true);
		const unified = unifiedRows(lines("a\nb\nc"), lines("a\nB\nc"), true);

		expect(anchorLineAt(compact, 1)).toBe(2);
		expect(anchorLineAt(unified, 1)).toBe(2);
		expect(anchorLineAt(diffRows(lines("a\nx"), lines("a"), true), 1)).toBeNull();
	});

	it("finds visible and folded lines", () => {
		expect(rowIndexForLine(folded, 8)).toBe(2);
		expect(rowIndexForLine(full, 8)).toBe(7);
		expect(rowIndexForLine(folded, 3)).toBe(0);
		expect(rowIndexForLine(folded, 17)).toBe(8);
	});

	it("skips removal rows and rejects lines beyond the file", () => {
		const unified = unifiedRows(lines("a\nb\nc"), lines("a\nB\nc"), true);

		expect(rowIndexForLine(unified, 2)).toBe(2);
		expect(rowIndexForLine(folded, 21)).toBeNull();
	});
});
