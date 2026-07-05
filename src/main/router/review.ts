import { type } from "arktype";
import { base } from "@main/router/_base";
import { Review, type Turn } from "@main/review/ReviewModel";
import { backfillTurns } from "@main/review/TranscriptBackfill";
import { countUnreviewed } from "@main/review/unreviewed";
import { ReviewState } from "@main/store/review-state";

// Hooks are primary (D5): only fall back to the on-disk transcript for a session
// that produced no live events — one that predates the app or ran without our hooks.
function resolveTurns(sessionId: string): Turn[] | Promise<Turn[]> {
	const live = Review.getTurns(sessionId);
	return live.length > 0 ? live : backfillTurns(sessionId);
}

export const reviewRouter = {
	getTurns: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => resolveTurns(input.sessionId)),
	status: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => Review.getStatus(input.sessionId)),
	unreviewedCount: base
		.input(type({ sessionId: "string > 0" }))
		.handler(async ({ input }) => {
			const [turns, reviewed] = await Promise.all([
				resolveTurns(input.sessionId),
				ReviewState.get(input.sessionId),
			]);

			return countUnreviewed(turns, reviewed);
		}),
};
