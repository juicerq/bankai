import { createRouterClient } from "@orpc/server";
import { router } from "@main/router";

export const testClient = createRouterClient(router, { context: {} });
