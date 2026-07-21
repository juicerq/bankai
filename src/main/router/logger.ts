import { type } from "arktype";
import { Logger } from "@main/logger";
import { base } from "@main/router/_base";

const rendererErrorInput = type({
	message: "string",
	"stack?": "string",
	"source?": "string",
});

export const loggerRouter = {
	error: base.input(rendererErrorInput).handler(({ input }) => {
		Logger.error(`renderer:${input.message}`, {
			stack: input.stack,
			source: input.source,
		});
		return null;
	}),
};
