import { commandsRouter } from "@main/transport/rpc/commands-router";
import { continuityRouter } from "@main/transport/rpc/continuity-router";
import { loggerRouter } from "@main/transport/rpc/logger-router";
import { mobileRouter } from "@main/transport/rpc/mobile-router";
import { projectsRouter } from "@main/transport/rpc/projects-router";
import { pushRouter } from "@main/transport/rpc/push-router";
import { reviewRouter } from "@main/transport/rpc/review-router";
import { servicesRouter } from "@main/transport/rpc/services-router";
import { settingsRouter } from "@main/transport/rpc/settings-router";

export const router = {
	commands: commandsRouter,
	continuity: continuityRouter,
	logger: loggerRouter,
	mobile: mobileRouter,
	projects: projectsRouter,
	push: pushRouter,
	review: reviewRouter,
	services: servicesRouter,
	settings: settingsRouter,
};

export type Router = typeof router;
