import { type } from "arktype";

export const projectSchema = type({
	id: "string",
	name: "string",
	path: "string",
	createdAt: "number",
});

export type Project = typeof projectSchema.infer;
