import { type } from "arktype";
import { reviewModeSchema } from "@main/git/git-contracts";

export const gitRequestSchema = type({
	id: "string",
	operation: "'snapshot'",
	path: "string",
	mode: reviewModeSchema,
	"shellId?": "string",
})
	.or({
		id: "string",
		operation: "'files'",
		path: "string",
		files: "string[]",
		mode: reviewModeSchema,
		"shellId?": "string",
	})
	.or({
		id: "string",
		operation: "'file'",
		path: "string",
		file: "string",
		mode: reviewModeSchema,
		"shellId?": "string",
	})
	.or({
		id: "string",
		operation: "'fullFile'",
		path: "string",
		file: "string",
		mode: reviewModeSchema,
		"shellId?": "string",
	})
	.or({
		id: "string",
		operation: "'worktrees'",
		path: "string",
	})
	.or({
		id: "string",
		operation: "'removeWorktree'",
		path: "string",
		worktree: "string",
	})
	.or({
		id: "string",
		operation: "'startTurn'",
		path: "string",
		shellId: "string",
	})
	.or({
		id: "string",
		operation: "'forgetTurn'",
		shellId: "string",
	});
export type GitRequest = typeof gitRequestSchema.infer;

export const gitResponseSchema = type({ id: "string", ok: "true", result: "unknown" }).or({
	id: "string",
	ok: "false",
	error: "string",
});
export type GitResponse = typeof gitResponseSchema.infer;
