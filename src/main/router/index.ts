import { flagsRouter } from "@main/router/flags";
import { loggerRouter } from "@main/router/logger";
import { reviewRouter } from "@main/router/review";
import { reviewStateRouter } from "@main/router/review-state";
import { sessionsRouter } from "@main/router/sessions";
import { settingsRouter } from "@main/router/settings";
import { workspaceRouter } from "@main/router/workspace";

export const router = {
	logger: loggerRouter,
	settings: settingsRouter,
	sessions: sessionsRouter,
	workspace: workspaceRouter,
	review: reviewRouter,
	reviewState: reviewStateRouter,
	flags: flagsRouter,
};

export type Router = typeof router;
