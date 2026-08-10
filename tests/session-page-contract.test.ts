import { expect, test } from "bun:test";
import { SessionPageSchemas } from "@shared/session-page";

test("session page contract validates presentations and state at runtime", () => {
	const presentation = SessionPageSchemas.presentation.assert({
		shellId: "shell-1",
		url: "https://example.com",
		navigation: 3,
		bounds: { x: 10.4, y: 20.6, width: 800, height: 600 },
	});

	expect(presentation.shellId).toBe("shell-1");
	expect(presentation.navigation).toBe(3);
	expect(() =>
		SessionPageSchemas.presentation.assert({
			shellId: "shell-1",
			url: "https://example.com",
			navigation: 1,
			bounds: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 600 },
		}),
	).toThrow();
	expect(() =>
		SessionPageSchemas.presentation.assert({
			shellId: "shell-1",
			url: "https://example.com",
			navigation: 1.5,
			bounds: { x: 0, y: 0, width: 800, height: 600 },
		}),
	).toThrow();
	expect(() => SessionPageSchemas.shellId.assert({ shellId: 42 })).toThrow();
	expect(() =>
		SessionPageSchemas.state.assert({
			shellId: "shell-1",
			url: "https://example.com/",
			title: "Example",
			canGoBack: false,
			canGoForward: false,
			loading: "no",
			failure: null,
		}),
	).toThrow();
	expect(SessionPageSchemas.shortcut.assert({ action: "toggle-review" })).toEqual({ action: "toggle-review" });
	expect(SessionPageSchemas.shortcut.assert({ action: "new-shell", plain: false })).toEqual({
		action: "new-shell",
		plain: false,
	});
	expect(SessionPageSchemas.shortcut.assert({ action: "open-settings" })).toEqual({ action: "open-settings" });
	expect(SessionPageSchemas.shortcut.assert({ action: "open-quick-open" })).toEqual({ action: "open-quick-open" });
	expect(SessionPageSchemas.shortcut.assert({ action: "jump-row", index: 4 })).toEqual({ action: "jump-row", index: 4 });
	expect(() => SessionPageSchemas.shortcut.assert({ action: "new-shell" })).toThrow();
	expect(() => SessionPageSchemas.shortcut.assert({ action: "jump-row", index: "4" })).toThrow();
});
