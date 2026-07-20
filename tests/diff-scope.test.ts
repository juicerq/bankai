import { describe, expect, it } from "vitest";
import { type DiffScope, nextScope, turnFiles } from "@core/review/diffScope";
import type { Turn } from "@core/review/ReviewModel";

const snap = (path: string, before: string[], after: string[]) => ({ path, before, after });

const turns: Turn[] = [
	{ turnId: "s:0", prompt: "add a", files: [snap("/a.ts", [], ["v0"])], state: "completed" },
	{
		turnId: "s:1",
		prompt: "add b, rewrite a",
		files: [snap("/b.ts", [], ["b"]), snap("/a.ts", ["v0"], ["v1"])],
		state: "completed",
	},
	{ turnId: "s:2", prompt: "just talk", files: [], state: "completed" },
];

describe("turnFiles", () => {
	it("returns only the selected turn's files", () => {
		expect(turnFiles(turns, 1).map((f) => f.path)).toEqual(["/b.ts", "/a.ts"]);
	});

	it("returns nothing for a talk-only turn", () => {
		expect(turnFiles(turns, 2)).toEqual([]);
	});

	it("returns nothing for an out-of-range selection or an empty session", () => {
		expect(turnFiles(turns, 9)).toEqual([]);
		expect(turnFiles([], 0)).toEqual([]);
	});
});

describe("nextScope", () => {
	it("cycles turn to uncommitted to branch and back", () => {
		const order: DiffScope[] = ["turn", "uncommitted", "branch", "turn"];
		let scope: DiffScope = "turn";
		for (const expected of order.slice(1)) {
			scope = nextScope(scope);
			expect(scope).toBe(expected);
		}
	});
});
