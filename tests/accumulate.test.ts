import { describe, expect, it } from "vitest";
import type { Turn } from "@main/review/ReviewModel";
import { filesForMode } from "../src/renderer/src/routes/review/$sessionId/-utils/accumulate";

const line = (turnId: string, path: string, n: number, text: string) => ({
	turnId,
	path,
	line: n,
	kind: "add" as const,
	text,
});

const turns: Turn[] = [
	{
		turnId: "s:0",
		prompt: "add a",
		files: [{ path: "/a.ts", lines: [line("s:0", "/a.ts", 1, "v0")] }],
	},
	{
		turnId: "s:1",
		prompt: "add b, rewrite a",
		files: [
			{ path: "/b.ts", lines: [line("s:1", "/b.ts", 1, "b")] },
			{ path: "/a.ts", lines: [line("s:1", "/a.ts", 1, "v1")] },
		],
	},
	{ turnId: "s:2", prompt: "just talk", files: [] },
];

describe("filesForMode", () => {
	it("per-turn returns only the selected turn's files", () => {
		expect(filesForMode(turns, 1, "turn").map((f) => f.path)).toEqual([
			"/b.ts",
			"/a.ts",
		]);
	});

	it("accumulated keeps the latest version of each file up to the selection", () => {
		const files = filesForMode(turns, 1, "accumulated");
		const a = files.find((f) => f.path === "/a.ts");

		expect(files.map((f) => f.path).sort()).toEqual(["/a.ts", "/b.ts"]);
		expect(a?.lines[0]?.text).toBe("v1");
	});

	it("accumulated at the first turn matches per-turn", () => {
		expect(filesForMode(turns, 0, "accumulated")).toEqual(
			filesForMode(turns, 0, "turn"),
		);
	});

	it("a talk-only turn shows no files but accumulates prior ones", () => {
		expect(filesForMode(turns, 2, "turn")).toEqual([]);
		expect(filesForMode(turns, 2, "accumulated").map((f) => f.path)).toEqual([
			"/a.ts",
			"/b.ts",
		]);
	});

	it("returns nothing for an out-of-range selection", () => {
		expect(filesForMode(turns, 9, "turn")).toEqual([]);
		expect(filesForMode([], 0, "accumulated")).toEqual([]);
	});
});
