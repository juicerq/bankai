import { describe, expect, it } from "vitest";
import type { Turn } from "@core/review/ReviewModel";
import { cascadeWarnings } from "@core/review/cascade";

const turn = (turnId: string, paths: string[]): Turn => ({
	turnId,
	prompt: "",
	files: paths.map((path) => ({ path, lines: [] })),
});

describe("cascadeWarnings", () => {
	it("warns nobody when nothing is flagged", () => {
		const turns = [turn("s:0", ["/a"]), turn("s:1", ["/a"])];

		expect(cascadeWarnings(turns, []).size).toBe(0);
	});

	it("warns a later turn that touches a flagged turn's path", () => {
		const turns = [turn("s:0", ["/a"]), turn("s:1", ["/a"])];

		expect(cascadeWarnings(turns, ["s:0"])).toEqual(new Map([["s:1", [0]]]));
	});

	it("does not warn when the later turn touches no shared path", () => {
		const turns = [turn("s:0", ["/a"]), turn("s:1", ["/b"])];

		expect(cascadeWarnings(turns, ["s:0"]).size).toBe(0);
	});

	it("never warns the flagged turn itself or earlier turns", () => {
		const turns = [turn("s:0", ["/a"]), turn("s:1", ["/a"])];

		expect(cascadeWarnings(turns, ["s:1"]).size).toBe(0);
	});

	it("lists every earlier flagged turn a turn builds on", () => {
		const turns = [
			turn("s:0", ["/a"]),
			turn("s:1", ["/a"]),
			turn("s:2", ["/a"]),
		];

		expect(cascadeWarnings(turns, ["s:0", "s:1"])).toEqual(
			new Map([
				["s:1", [0]],
				["s:2", [0, 1]],
			]),
		);
	});

	it("reaches across an unflagged turn to the flagged source", () => {
		const turns = [
			turn("s:0", ["/a"]),
			turn("s:1", ["/b"]),
			turn("s:2", ["/a"]),
		];

		expect(cascadeWarnings(turns, ["s:0"])).toEqual(new Map([["s:2", [0]]]));
	});
});
