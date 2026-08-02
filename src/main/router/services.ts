import { type } from "arktype";
import { base } from "@main/router/base";
import { Services } from "@main/services/Services";

const serviceInput = type({ commandId: "string" });

export const servicesRouter = {
	list: base.handler(() => Services.list()),
	start: base.input(serviceInput).handler(({ input }) => Services.start(input.commandId)),
	stop: base.input(serviceInput).handler(({ input }) => Services.stop(input.commandId)),
};
