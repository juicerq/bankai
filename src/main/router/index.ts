import { loggerRouter } from "@main/router/logger";
import { projectsRouter } from "@main/router/projects";

export const router = {
	logger: loggerRouter,
	projects: projectsRouter,
};

export type Router = typeof router;
