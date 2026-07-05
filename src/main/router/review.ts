import { type } from "arktype";
import { base } from "@main/router/_base";
import { Review } from "@main/review/ReviewModel";
import { backfillTurns } from "@main/review/TranscriptBackfill";

export const reviewRouter = {
	getTurns: base
		.input(type({ sessionId: "string > 0" }))
		.handler(async ({ input }) => {
			// Hooks are primary (D5): only fall back to the on-disk transcript for a session
			// that produced no live events — one that predates the app or ran without our hooks.
			const live = Review.getTurns(input.sessionId);
			return live.length > 0 ? live : backfillTurns(input.sessionId);
		}),
	status: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => Review.getStatus(input.sessionId)),
};
