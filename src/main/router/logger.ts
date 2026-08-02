import { type } from "arktype";
import { Logger } from "@main/logger";
import { base } from "@main/router/base";
import { markRendererStartup } from "@main/startup";

const rendererErrorInput = type({
	message: "string",
	"stack?": "string",
	"source?": "string",
});

const startupInput = type({
	marks: type({ stage: "string", at: "number" }).array(),
});

export const loggerRouter = {
	error: base.input(rendererErrorInput).handler(({ input }) => {
		Logger.error(`renderer:${input.message}`, {
			stack: input.stack,
			source: input.source,
		});
		return null;
	}),

	startup: base.input(startupInput).handler(({ input }) => {
		markRendererStartup(input.marks);
		return null;
	}),
};
