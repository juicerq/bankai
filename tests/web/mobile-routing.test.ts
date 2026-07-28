import "./register-dom";
import { setContinuityTransport } from "./orpc-transport";
import "./stream-transport";
import { afterEach, expect, test } from "bun:test";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "@renderer/routeTree.gen";

setContinuityTransport({ value: { workspaces: [] }, calls: [] });

afterEach(() => Reflect.deleteProperty(window, "bankaiWindow"));

async function landing() {
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
	await router.load();

	return router.state.location.pathname;
}

test("a client with no window bridge is a browser and gets the mobile surface", async () => {
	expect(await landing()).toBe("/mobile");
});

test("the Electron renderer keeps the desktop workspace", async () => {
	Object.assign(window, { bankaiWindow: {} });

	expect(await landing()).toBe("/");
});
