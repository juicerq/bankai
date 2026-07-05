import { describe, expect, it } from "vitest";
import type { Turn } from "@main/review/ReviewModel";
import { countUnreviewed } from "@main/review/unreviewed";

const turn = (turnId: string): Turn => ({ turnId, prompt: "", files: [] });

describe("countUnreviewed", () => {
	it("counts every turn when none are reviewed", () => {
		expect(countUnreviewed([turn("s:0"), turn("s:1")], [])).toBe(2);
	});

	it("excludes reviewed turns", () => {
		expect(countUnreviewed([turn("s:0"), turn("s:1")], ["s:0"])).toBe(1);
	});

	it("is zero when every turn is reviewed", () => {
		expect(countUnreviewed([turn("s:0"), turn("s:1")], ["s:0", "s:1"])).toBe(0);
	});

	it("ignores reviewed ids that no longer map to a turn", () => {
		expect(countUnreviewed([turn("s:0")], ["s:0", "s:9"])).toBe(0);
	});
});
