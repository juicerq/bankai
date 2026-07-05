import { type } from "arktype";
import { base } from "@main/router/_base";
import { Review } from "@main/review/ReviewModel";

export const reviewRouter = {
	getTurns: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => Review.getTurns(input.sessionId)),
	status: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => Review.getStatus(input.sessionId)),
};
