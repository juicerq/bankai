import { createBrowserHistory, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { isBrowserClient } from "@renderer/lib/platform";
import { routeTree } from "@renderer/routeTree.gen";
import { CrashScreen } from "@renderer/routes/-features/app/status/crash-screen";

export const router = createRouter({
	routeTree,
	history: isBrowserClient() ? createBrowserHistory() : createMemoryHistory(),
	defaultErrorComponent: CrashScreen,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
