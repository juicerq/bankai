import { type } from "arktype";
import { reviewModeSchema } from "@main/git/contracts";

export const gitRequestSchema = type({
	id: "string",
	operation: "'snapshot'",
	path: "string",
	mode: reviewModeSchema,
})
	.or({
		id: "string",
		operation: "'file'",
		path: "string",
		file: "string",
		mode: reviewModeSchema,
	})
	.or({
		id: "string",
		operation: "'fullFile'",
		path: "string",
		file: "string",
		mode: reviewModeSchema,
	});
export type GitRequest = typeof gitRequestSchema.infer;

export const gitResponseSchema = type({ id: "string", ok: "true", result: "unknown" }).or({
	id: "string",
	ok: "false",
	error: "string",
});
export type GitResponse = typeof gitResponseSchema.infer;
