import { type } from "arktype";
import { base } from "@main/router/_base";
import { Flags } from "@main/store/flags";

export const flagsRouter = {
	get: base
		.input(type({ sessionId: "string > 0" }))
		.handler(({ input }) => Flags.get(input.sessionId)),
	setFlag: base
		.input(
			type({
				sessionId: "string > 0",
				turnId: "string > 0",
				"path?": "string",
				"line?": "number",
				flagged: "boolean",
			}),
		)
		.handler(({ input }) => Flags.setFlag(input)),
};
