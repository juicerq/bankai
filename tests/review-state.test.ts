import { describe, expect, it } from "vitest";
import { ReviewState } from "@core/store/review-state";

describe("reviewState", () => {
	it("returns no reviewed turns for an unknown session", async () => {
		expect(await ReviewState.get("s1")).toEqual([]);
	});

	it("marks a turn reviewed and reads it back", async () => {
		await ReviewState.setReviewed({
			sessionId: "s1",
			turnId: "s1:0",
			reviewed: true,
		});
		expect(await ReviewState.get("s1")).toEqual(["s1:0"]);
	});

	it("does not duplicate a turn already reviewed", async () => {
		await ReviewState.setReviewed({
			sessionId: "s1",
			turnId: "s1:0",
			reviewed: true,
		});
		const ids = await ReviewState.setReviewed({
			sessionId: "s1",
			turnId: "s1:0",
			reviewed: true,
		});
		expect(ids).toEqual(["s1:0"]);
	});

	it("unmarks a reviewed turn without touching the others", async () => {
		await ReviewState.setReviewed({
			sessionId: "s1",
			turnId: "s1:0",
			reviewed: true,
		});
		await ReviewState.setReviewed({
			sessionId: "s1",
			turnId: "s1:1",
			reviewed: true,
		});
		const ids = await ReviewState.setReviewed({
			sessionId: "s1",
			turnId: "s1:0",
			reviewed: false,
		});
		expect(ids).toEqual(["s1:1"]);
	});

	it("keeps reviewed turns isolated per session", async () => {
		await ReviewState.setReviewed({
			sessionId: "a",
			turnId: "a:0",
			reviewed: true,
		});
		await ReviewState.setReviewed({
			sessionId: "b",
			turnId: "b:0",
			reviewed: true,
		});
		expect(await ReviewState.get("a")).toEqual(["a:0"]);
		expect(await ReviewState.get("b")).toEqual(["b:0"]);
	});
});
