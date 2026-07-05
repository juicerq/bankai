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

	it("accumulated promotes any session-introduced line to add, keeping pre-existing as context", () => {
		const annotated: Turn[] = [
			{
				turnId: "s:0",
				prompt: "p0",
				files: [{ path: "/f.ts", lines: [line("s:0", "/f.ts", 1, "a")] }],
			},
			{
				turnId: "s:1",
				prompt: "p1",
				files: [
					{
						path: "/f.ts",
						lines: [
							{ turnId: "", path: "/f.ts", line: 1, kind: "context", text: "pre" },
							{ turnId: "s:0", path: "/f.ts", line: 2, kind: "context", text: "a" },
							{ turnId: "s:1", path: "/f.ts", line: 3, kind: "add", text: "b" },
						],
					},
				],
			},
		];

		const acc = filesForMode(annotated, 1, "accumulated")[0]?.lines.map((l) => [
			l.kind,
			l.turnId,
		]);
		expect(acc).toEqual([
			["context", ""],
			["add", "s:0"],
			["add", "s:1"],
		]);
		expect(filesForMode(annotated, 1, "turn")[0]?.lines[1]?.kind).toBe("context");
	});
});
