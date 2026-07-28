import { createBrowserHistory, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { isBrowserClient } from "@renderer/lib/platform";
import { routeTree } from "@renderer/routeTree.gen";

export const router = createRouter({
	routeTree,
	history: isBrowserClient() ? createBrowserHistory() : createMemoryHistory(),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
