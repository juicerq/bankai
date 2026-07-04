import { loggerRouter } from "@main/router/logger";
import { settingsRouter } from "@main/router/settings";
import { todosRouter } from "@main/router/todos";

export const router = {
	logger: loggerRouter,
	settings: settingsRouter,
	todos: todosRouter,
};

export type Router = typeof router;
