import { expect, test } from "bun:test";
import { SessionPageRegistry } from "@renderer/routes/-features/session-page/session-page-registry";

test("session pages keep one transient destination and native state per shell", async () => {
	const registry = SessionPageRegistry.create();
	let changes = 0;
	const unsubscribe = registry.subscribe(() => {
		changes += 1;
	});

	registry.open("shell-1", "https://one.example/path?token=secret#result");
	registry.open("shell-2", "https://two.example/");
	registry.open("shell-1", "https://one.example/next");
	registry.update({
		shellId: "shell-1",
		url: "https://one.example/loaded?private=yes#anchor",
		title: "One",
		canGoBack: true,
		canGoForward: false,
		loading: false,
		failure: null,
	});

	expect(registry.get("shell-1")).toEqual({
		url: "https://one.example/next",
		navigation: 2,
		state: {
			shellId: "shell-1",
			url: "https://one.example/loaded?private=yes#anchor",
			title: "One",
			canGoBack: true,
			canGoForward: false,
			loading: false,
			failure: null,
		},
	});
	expect(registry.get("shell-2")?.url).toBe("https://two.example/");
	expect(registry.displayUrl("shell-1")).toBe("https://one.example/loaded");
	expect(changes).toBe(4);

	registry.open("shell-1", "https://one.example/next");

	expect(registry.get("shell-1")?.navigation).toBe(3);
	expect(registry.get("shell-1")?.state?.title).toBe("One");
	expect(changes).toBe(5);

	await registry.release(["shell-1"]);

	expect(registry.has("shell-1")).toBe(false);
	expect(registry.has("shell-2")).toBe(true);
	expect(changes).toBe(6);
	unsubscribe();
});

test("native state for a hidden shell cannot overwrite the visible shell destination", () => {
	const registry = SessionPageRegistry.create();

	registry.open("shell-1", "https://one.example/");
	registry.update({
		shellId: "shell-2",
		url: "https://other.example/",
		title: "Other",
		canGoBack: false,
		canGoForward: false,
		loading: false,
		failure: null,
	});

	expect(registry.get("shell-1")?.state).toBeUndefined();
	expect(registry.has("shell-2")).toBe(false);
});
