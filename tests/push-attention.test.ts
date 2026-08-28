import { describe, expect, test } from "bun:test";
import { ShellActivity } from "@main/agents/shell-activity";
import { ShellFocus } from "@main/terminal/shell-focus";
import type { AgentActivityState } from "@shared/activity";
import { AttentionPush } from "@main/push/attention-push";
import { NotifyAttention } from "@main/push/notify-attention";
import type { PushSender } from "@main/push/web-push";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import { TerminalMessages } from "@main/transport/stream/terminal-messages";
import { PushSubscriptions } from "@main/store/push-subscriptions";
import { shellProcesses } from "@main/terminal/shell-processes";

const SHELL_ID = "shell-a";

describe("attention push payload", () => {
	test("the session name titles the notification and the shell rides as data", () => {
		expect(AttentionPush.payload({ shellId: SHELL_ID, title: "Rewrite the parser", branch: "parser" })).toEqual({
			title: "Rewrite the parser",
			body: AttentionPush.PUSH_DEFAULT_BODY,
			data: { shellId: SHELL_ID },
		});
	});

	test("an unnamed session falls back to its branch", () => {
		expect(AttentionPush.payload({ shellId: SHELL_ID, title: "  ", branch: "parser" }).title).toBe("parser");
	});

	test("a session with neither name nor branch falls back to the app name", () => {
		expect(AttentionPush.payload({ shellId: SHELL_ID }).title).toBe(AttentionPush.PUSH_DEFAULT_TITLE);
	});

});

describe("done push payload", () => {
	test("the finished session is named, and the project it belongs to rides in the body", () => {
		expect(AttentionPush.donePayload({ shellId: SHELL_ID, title: "Rewrite the parser", project: "bankai" })).toEqual({
			title: "Rewrite the parser",
			body: `${AttentionPush.PUSH_DONE_BODY} in bankai`,
			data: { shellId: SHELL_ID },
		});
	});

	test("a session whose project is unknown still says it is done", () => {
		expect(AttentionPush.donePayload({ shellId: SHELL_ID, project: " " }).body).toBe(AttentionPush.PUSH_DONE_BODY);
	});

	test("done and needs attention collapse on the phone because both carry the same shell", () => {
		expect(AttentionPush.donePayload({ shellId: SHELL_ID }).data).toEqual(AttentionPush.payload({ shellId: SHELL_ID }).data);
	});
});

describe("the turns that are worth a notification", () => {
	const working = new Map<string, AgentActivityState>([["s1", "working"]]);
	const done = new Map<string, AgentActivityState>([["s1", "done"]]);

	test("a turn that just finished is the one that notifies", () => {
		expect(ShellActivity.changes(working, done).done).toEqual(["s1"]);
	});

	test("a session that was already done does not notify again", () => {
		expect(ShellActivity.changes(done, done).done).toEqual([]);
	});

	test("a session that went back to work does not notify", () => {
		expect(ShellActivity.changes(done, working).done).toEqual([]);
	});
});

describe("push subscription health", () => {
	test("a push service that lost the subscription reports it gone", () => {
		expect(AttentionPush.isGone(404)).toBe(true);
		expect(AttentionPush.isGone(410)).toBe(true);
	});

	test("a throttled or broken push service keeps the subscription", () => {
		expect(AttentionPush.isGone(429)).toBe(false);
		expect(AttentionPush.isGone(500)).toBe(false);
		expect(AttentionPush.isGone()).toBe(false);
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
		ShellFocus.focus(connection("c1"), "focus-a");

		expect(ShellFocus.isFocused("focus-a")).toBe(true);
		expect(ShellFocus.isFocused("focus-b")).toBe(false);
	});

	test("a client that hides releases the shell without disconnecting", () => {
		const client = connection("c2");
		ShellFocus.focus(client, "focus-hidden");
		ShellFocus.focus(client);

		expect(ShellFocus.isFocused("focus-hidden")).toBe(false);
		expect(client.registrations()).toBe(1);
	});

	test("a dropped connection stops holding its shell in focus", () => {
		const client = connection("c3");
		ShellFocus.focus(client, "focus-dropped");
		client.close();

		expect(ShellFocus.isFocused("focus-dropped")).toBe(false);
	});

	test("another client keeps the shell in focus after one leaves", () => {
		const desk = connection("c4");
		const phone = connection("c5");
		ShellFocus.focus(desk, "focus-shared");
		ShellFocus.focus(phone, "focus-shared");
		desk.close();

		expect(ShellFocus.isFocused("focus-shared")).toBe(true);
	});
});

describe("a turn asked from the phone notifies the phone", () => {
	const WATCHER = { id: "watch-desktop", onClose: () => {} };

	function sender() {
		const sent: unknown[] = [];
		const send: PushSender = async ({ payload }) => {
			sent.push(payload);

			return "sent";
		};

		return { sent, send };
	}

	async function subscribe(): Promise<void> {
		await PushSubscriptions.save({ endpoint: "https://push.test/phone", keys: { p256dh: "p", auth: "a" } });
	}

	const OWNER = { projectId: "project-a", shellId: "shell-phone" };

	test("a watched shell still pushes done when the phone asked for the turn, once", async () => {
		await subscribe();
		ShellFocus.focus(WATCHER, OWNER.shellId);
		const { sent, send } = sender();

		NotifyAttention.mobileShells.add(OWNER.shellId);
		await NotifyAttention.turnDone(OWNER, send);

		expect(sent).toHaveLength(1);

		await NotifyAttention.turnDone(OWNER, send);

		expect(sent).toHaveLength(1);
		ShellFocus.focus(WATCHER);
	});

	test("a watched shell keeps swallowing the push of a desktop-started turn", async () => {
		await subscribe();
		ShellFocus.focus(WATCHER, OWNER.shellId);
		const { sent, send } = sender();

		await NotifyAttention.turnDone(OWNER, send);

		expect(sent).toHaveLength(0);
		ShellFocus.focus(WATCHER);
	});

	test("needs-attention reaches the phone mid-turn without spending the claim", async () => {
		await subscribe();
		ShellFocus.focus(WATCHER, OWNER.shellId);
		const { sent, send } = sender();

		NotifyAttention.mobileShells.add(OWNER.shellId);
		await NotifyAttention.needsAttention(OWNER, send);

		expect(sent).toHaveLength(1);
		expect(NotifyAttention.mobileShells.has(OWNER.shellId)).toBe(true);
		NotifyAttention.mobileShells.delete(OWNER.shellId);
		ShellFocus.focus(WATCHER);
	});

	test("typing on the desktop takes the turn back from the phone", async () => {
		const sessionId = "term-mobile-turn";
		shellProcesses.register({
			...OWNER,
			sessionId,
			cols: 80,
			rows: 24,
			process: { pid: 4242, write: () => {}, resize: () => {}, kill: () => {} },
		});

		NotifyAttention.mobileShells.add(OWNER.shellId);
		await TerminalMessages.handle(new StreamConnection({ readyState: 1, send: () => {} }), {
			channel: "terminal",
			type: "write",
			payload: { sessionId, data: "ls" },
		});

		expect(NotifyAttention.mobileShells.has(OWNER.shellId)).toBe(false);
		shellProcesses.close(sessionId);
	});
});
