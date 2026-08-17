import { type } from "arktype";

export const todoSchema = type({
	id: "string",
	projectId: "string",
	text: "string",
	createdAt: "number",
	"doneAt?": "number",
});

export const todoDraftSchema = type({
	text: type("string").atLeastLength(1).atMostLength(2000),
});

export type Todo = typeof todoSchema.infer;
export type TodoDraft = typeof todoDraftSchema.infer;
