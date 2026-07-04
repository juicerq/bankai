import { type } from "arktype";

export const envelopeSchema = type({
	version: "number",
	data: "unknown",
});
