import { describe, expect, it } from "vitest";
import { ReviewState } from "@core/store/review-state";

const session = { harness: "claude" as const, sessionId: "s1" };

describe("ReviewState", () => {
	it("toggles completed Turns by Session", async () => {
		expect(await ReviewState.get(session)).toEqual([]);
		expect(await ReviewState.toggle(session, "s1:0")).toEqual(["s1:0"]);
		expect(await ReviewState.toggle(session, "s1:0")).toEqual([]);
	});

	it("isolates Harnesses with the same native id", async () => {
		await ReviewState.toggle(session, "s1:0");
		expect(await ReviewState.get({ harness: "codex", sessionId: "s1" })).toEqual([]);
	});
});
