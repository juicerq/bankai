import { describe, expect, it } from "vitest";
import { diffStats } from "@core/review/diff";

function lines(text: string): string[] {
	return text === "" ? [] : text.split("\n");
}

describe("diffStats", () => {
	it("sums additions and deletions across files", () => {
		const files = [
			{ before: lines("a\nb\nc"), after: lines("a\nB\nc\nd") },
			{ before: lines("x"), after: [] },
		];

		expect(diffStats(files)).toEqual({ state: "exact", added: 2, removed: 2 });
	});

	it("returns zeros for an untouched file", () => {
		expect(diffStats([{ before: lines("a\nb"), after: lines("a\nb") }])).toEqual({
			state: "exact",
			added: 0,
			removed: 0,
		});
	});

	it("does not fabricate statistics for a diff that is too expensive", () => {
		const before = Array.from({ length: 3001 }, (_, index) => `l${index}`);

		expect(diffStats([{ before, after: [...before, "x"] }])).toEqual({
			state: "too-large",
		});
	});
});
