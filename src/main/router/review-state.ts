import { type } from "arktype";
import { base } from "@main/router/_base";
import { ReviewState } from "@main/store/review-state";

export const reviewStateRouter = {
	get: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => ReviewState.get(input.sessionId)),
	setReviewed: base
		.input(
			type({
				sessionId: "string > 0",
				turnId: "string > 0",
				reviewed: "boolean",
			}),
		)
		.handler(({ input }) => ReviewState.setReviewed(input)),
};
