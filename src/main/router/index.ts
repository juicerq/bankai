import { commandsRouter } from "@main/router/commands";
import { continuityRouter } from "@main/router/continuity";
import { loggerRouter } from "@main/router/logger";
import { mobileRouter } from "@main/router/mobile";
import { projectsRouter } from "@main/router/projects";
import { pushRouter } from "@main/router/push";
import { reviewRouter } from "@main/router/review";
import { settingsRouter } from "@main/router/settings";

export const router = {
	commands: commandsRouter,
	continuity: continuityRouter,
	logger: loggerRouter,
	mobile: mobileRouter,
	projects: projectsRouter,
	push: pushRouter,
	review: reviewRouter,
	settings: settingsRouter,
};

export type Router = typeof router;
