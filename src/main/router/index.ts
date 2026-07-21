import { loggerRouter } from "@main/router/logger";
import { projectsRouter } from "@main/router/projects";
import { reviewRouter } from "@main/router/review";

export const router = {
	logger: loggerRouter,
	projects: projectsRouter,
	review: reviewRouter,
};

export type Router = typeof router;
