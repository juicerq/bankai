import { loggerRouter } from "@main/router/logger";
import { sessionsRouter } from "@main/router/sessions";
import { settingsRouter } from "@main/router/settings";
import { workspaceRouter } from "@main/router/workspace";

export const router = {
	logger: loggerRouter,
	settings: settingsRouter,
	sessions: sessionsRouter,
	workspace: workspaceRouter,
};

export type Router = typeof router;
