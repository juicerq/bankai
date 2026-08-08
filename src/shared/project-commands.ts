import { type } from "arktype";

export const projectCommandSchema = type({
	id: "string",
	projectId: "string",
	label: "string",
	command: "string",
	kind: "'task' | 'service'",
	"autostart?": "boolean",
	createdAt: "number",
});

export const projectCommandDraftSchema = type({
	label: type("string").atLeastLength(1).atMostLength(60),
	command: type("string").atLeastLength(1).atMostLength(2000),
	kind: "'task' | 'service'",
	"autostart?": "boolean",
});

export type ProjectCommand = typeof projectCommandSchema.infer;
export type ProjectCommandDraft = typeof projectCommandDraftSchema.infer;
