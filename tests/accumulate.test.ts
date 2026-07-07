import { describe, expect, it } from "vitest";
import type { Turn } from "@core/review/ReviewModel";
import { filesForMode } from "@core/review/accumulate";

const snap = (path: string, before: string[], after: string[]) => ({ path, before, after });

const turns: Turn[] = [
	{ turnId: "s:0", prompt: "add a", files: [snap("/a.ts", [], ["v0"])] },
	{
		turnId: "s:1",
		prompt: "add b, rewrite a",
		files: [snap("/b.ts", [], ["b"]), snap("/a.ts", ["v0"], ["v1"])],
	},
	{ turnId: "s:2", prompt: "just talk", files: [] },
];

describe("filesForMode", () => {
	it("per-turn returns only the selected turn's files", () => {
		expect(filesForMode(turns, 1, "turn").map((f) => f.path)).toEqual(["/b.ts", "/a.ts"]);
	});

	it("accumulated pairs the earliest before with the latest after per file", () => {
		const files = filesForMode(turns, 1, "accumulated");
		const a = files.find((f) => f.path === "/a.ts");

		expect(files.map((f) => f.path).sort()).toEqual(["/a.ts", "/b.ts"]);
		expect(a).toEqual({ path: "/a.ts", before: [], after: ["v1"] });
	});

	it("accumulated spans the whole session regardless of the selected turn", () => {
		expect(filesForMode(turns, 0, "accumulated")).toEqual(filesForMode(turns, 2, "accumulated"));
	});

	it("a talk-only turn shows no files per-turn", () => {
		expect(filesForMode(turns, 2, "turn")).toEqual([]);
		expect(filesForMode(turns, 2, "accumulated").map((f) => f.path)).toEqual(["/a.ts", "/b.ts"]);
	});

	it("accumulated nets out a line added then later removed", () => {
		const churn: Turn[] = [
			{ turnId: "s:0", prompt: "base", files: [snap("/f.ts", ["a", "c"], ["a", "c"])] },
			{ turnId: "s:1", prompt: "add b", files: [snap("/f.ts", ["a", "c"], ["a", "b", "c"])] },
			{ turnId: "s:2", prompt: "drop b", files: [snap("/f.ts", ["a", "b", "c"], ["a", "c"])] },
		];

		expect(filesForMode(churn, 2, "accumulated")[0]).toEqual({
			path: "/f.ts",
			before: ["a", "c"],
			after: ["a", "c"],
		});
	});

	it("returns nothing for an out-of-range selection or an empty session", () => {
		expect(filesForMode(turns, 9, "turn")).toEqual([]);
		expect(filesForMode([], 0, "accumulated")).toEqual([]);
	});
});
