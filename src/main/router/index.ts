import { loggerRouter } from "@main/router/logger";
import { projectsRouter } from "@main/router/projects";
import { reviewRouter } from "@main/router/review";
import { settingsRouter } from "@main/router/settings";

export const router = {
	logger: loggerRouter,
	projects: projectsRouter,
	review: reviewRouter,
	settings: settingsRouter,
};

export type Router = typeof router;
