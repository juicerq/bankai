import { type } from "arktype";
import { reviewClosedTargetSchema } from "@shared/review-default-closure";

export const projectSchema = type({
	id: "string",
	name: "string",
	path: "string",
	createdAt: "number",
	reviewClosedTargets: reviewClosedTargetSchema.array(),
});

export type Project = typeof projectSchema.infer;
