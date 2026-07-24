import { continuityRouter } from "@main/router/continuity";
import { loggerRouter } from "@main/router/logger";
import { projectsRouter } from "@main/router/projects";
import { reviewRouter } from "@main/router/review";
import { settingsRouter } from "@main/router/settings";

export const router = {
	continuity: continuityRouter,
	logger: loggerRouter,
	projects: projectsRouter,
	review: reviewRouter,
	settings: settingsRouter,
};

export type Router = typeof router;
