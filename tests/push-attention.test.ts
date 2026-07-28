import { describe, expect, test } from "bun:test";
import { focusShell, shellFocused } from "@main/activity/ShellFocus";
import {
	attentionPushPayload,
	PUSH_BODY_MAX_LENGTH,
	PUSH_DEFAULT_BODY,
	PUSH_DEFAULT_TITLE,
	subscriptionGone,
} from "@main/push/attention";

const SHELL_ID = "shell-a";

describe("attention push payload", () => {
	test("the session name titles the notification and the shell rides as data", () => {
		expect(attentionPushPayload({ shellId: SHELL_ID, title: "Rewrite the parser", branch: "parser" })).toEqual({
			title: "Rewrite the parser",
			body: PUSH_DEFAULT_BODY,
			data: { shellId: SHELL_ID },
		});
	});

	test("an unnamed session falls back to its branch", () => {
		expect(attentionPushPayload({ shellId: SHELL_ID, title: "  ", branch: "parser" }).title).toBe("parser");
	});

	test("a session with neither name nor branch falls back to the app name", () => {
		expect(attentionPushPayload({ shellId: SHELL_ID }).title).toBe(PUSH_DEFAULT_TITLE);
	});

	test("the attention message becomes the body", () => {
		const payload = attentionPushPayload({
			shellId: SHELL_ID,
			attention: { message: "Claude needs your permission to use Bash", at: 1 },
		});

		expect(payload.body).toBe("Claude needs your permission to use Bash");
	});

	test("a long tool detail is cut to what a notification can carry", () => {
		const payload = attentionPushPayload({
			shellId: SHELL_ID,
			attention: { message: "Permission required", at: 1, detail: "rm ".repeat(200) },
		});

		expect(payload.body).toHaveLength(PUSH_BODY_MAX_LENGTH);
	});

	test("the detail joins the message when the hook carried one", () => {
		const payload = attentionPushPayload({
			shellId: SHELL_ID,
			attention: { message: "Permission required", at: 1, detail: "rm -rf out" },
		});

		expect(payload.body).toBe("Permission required — rm -rf out");
	});
});

describe("push subscription health", () => {
	test("a push service that lost the subscription reports it gone", () => {
		expect(subscriptionGone(404)).toBe(true);
		expect(subscriptionGone(410)).toBe(true);
	});

	test("a throttled or broken push service keeps the subscription", () => {
		expect(subscriptionGone(429)).toBe(false);
		expect(subscriptionGone(500)).toBe(false);
		expect(subscriptionGone()).toBe(false);
	});
});

describe("shell focus", () => {
	function connection(id: string) {
		const cleanups: (() => void)[] = [];

		return {
			id,
			onClose: (cleanup: () => void) => cleanups.push(cleanup),
			close: () => {
				for (const cleanup of cleanups) {
					cleanup();
				}
			},
			registrations: () => cleanups.length,
		};
	}

	test("a client watching a conversation holds that shell in focus", () => {
		focusShell(connection("c1"), "focus-a");

		expect(shellFocused("focus-a")).toBe(true);
		expect(shellFocused("focus-b")).toBe(false);
	});

	test("a client that hides releases the shell without disconnecting", () => {
		const client = connection("c2");
		focusShell(client, "focus-hidden");
		focusShell(client);

		expect(shellFocused("focus-hidden")).toBe(false);
		expect(client.registrations()).toBe(1);
	});

	test("a dropped connection stops holding its shell in focus", () => {
		const client = connection("c3");
		focusShell(client, "focus-dropped");
		client.close();

		expect(shellFocused("focus-dropped")).toBe(false);
	});

	test("another client keeps the shell in focus after one leaves", () => {
		const desk = connection("c4");
		const phone = connection("c5");
		focusShell(desk, "focus-shared");
		focusShell(phone, "focus-shared");
		desk.close();

		expect(shellFocused("focus-shared")).toBe(true);
	});
});
