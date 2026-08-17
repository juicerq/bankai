import { describe, expect, test } from "bun:test";
import { elapsedLabel } from "@renderer/routes/-features/shared/time/elapsed";

describe("saying how long a session has held its state", () => {
	test("the first minute counts in seconds", () => {
		expect(elapsedLabel(0)).toBe("0s");
		expect(elapsedLabel(7_400)).toBe("7s");
		expect(elapsedLabel(59_999)).toBe("59s");
	});

	test("past a minute the seconds stop mattering", () => {
		expect(elapsedLabel(60_000)).toBe("1m");
		expect(elapsedLabel(4 * 60_000 + 59_000)).toBe("4m");
		expect(elapsedLabel(59 * 60_000)).toBe("59m");
	});

	test("past an hour both parts show", () => {
		expect(elapsedLabel(60 * 60_000)).toBe("1h0m");
		expect(elapsedLabel(2 * 60 * 60_000 + 13 * 60_000)).toBe("2h13m");
	});

	test("past a day the hours take over from the minutes", () => {
		expect(elapsedLabel(23 * 60 * 60_000 + 59 * 60_000)).toBe("23h59m");
		expect(elapsedLabel(24 * 60 * 60_000)).toBe("1d0h");
		expect(elapsedLabel(3 * 24 * 60 * 60_000 + 5 * 60 * 60_000 + 59 * 60_000)).toBe("3d5h");
	});

	test("a clock that reads ahead of the harness never counts backwards", () => {
		expect(elapsedLabel(-5_000)).toBe("0s");
	});
});
