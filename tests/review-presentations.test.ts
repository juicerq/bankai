import { describe, expect, it } from "vitest";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import { ReviewPresentations } from "@core/session/ReviewPresentations";

const session = { harness: "claude" as const, sessionId: "presentation" };
const turn = {
	turnId: "presentation:0",
	prompt: "change",
	files: [{ path: "/a", before: ["old"], after: ["new"] }],
	state: "completed" as const,
};

describe("ReviewPresentations", () => {
	it("owns loading and reviewed transitions", async () => {
		const projector = new TranscriptProjector();
		let published = 0;
		const presentations = new ReviewPresentations(projector, {
			session,
			turns: [turn],
			reviewed: [],
			available: true,
		}, () => published++);

		presentations.setLoading(session);
		expect(presentations.get(session).availability).toBe("loading");

		await presentations.toggle(session, turn.turnId);
		expect(presentations.get(session).reviewedTurnIds).toEqual([turn.turnId]);
		expect(published).toBe(2);
	});

	it("keeps Sessions isolated", () => {
		const presentations = new ReviewPresentations(
			new TranscriptProjector(),
			null,
			() => {},
		);

		expect(presentations.get(null).availability).toBe("available");
		expect(presentations.get(session).availability).toBe("loading");
	});

	it("serializes concurrent reviewed transitions", async () => {
		const presentations = new ReviewPresentations(
			new TranscriptProjector(),
			{
				session,
				turns: [turn],
				reviewed: [],
				available: true,
			},
			() => {},
		);

		await Promise.all([
			presentations.toggle(session, turn.turnId),
			presentations.toggle(session, turn.turnId),
		]);

		expect(presentations.get(session).reviewedTurnIds).toEqual([]);
	});
});
