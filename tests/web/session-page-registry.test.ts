import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import { SessionPageRegistry } from "@renderer/routes/-features/session-page/session-page-registry";

afterEach(() => {
	delete window.bankaiSessionPage;
});

test("releasing removed Shells forgets and releases every page they owned", async () => {
	const released: string[] = [];
	window.bankaiSessionPage = {
		present: async () => {},
		release: async (shellId) => {
			released.push(shellId);
		},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	};
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/one");
	registry.open("shell-2", "https://example.com/two");

	await registry.release(["shell-1", "shell-2", "shell-without-page"]);

	expect(registry.has("shell-1")).toBe(false);
	expect(registry.has("shell-2")).toBe(false);
	expect(released).toEqual(["shell-1", "shell-2"]);
});

test("closing discards a blank page and keeps one that reached a URL", () => {
	const registry = SessionPageRegistry.create();
	registry.blank("shell-1");
	registry.open("shell-2", "https://example.com/two");

	registry.close("shell-1");
	registry.close("shell-2");
	registry.close("shell-without-page");

	expect(registry.has("shell-1")).toBe(false);
	expect(registry.has("shell-2")).toBe(true);
});

test("opening blank on a Shell that already has a page leaves its URL alone", () => {
	const registry = SessionPageRegistry.create();
	registry.open("shell-1", "https://example.com/one");

	registry.blank("shell-1");

	expect(registry.displayUrl("shell-1")).toBe("https://example.com/one");
});
