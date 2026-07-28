import { expect, test } from "bun:test";
import { focusShell } from "@main/activity/ShellFocus";
import { attentionPushPayload } from "@main/push/attention";
import { pushNeedsAttention } from "@main/push/notifyAttention";
import { deliverAttentionPush } from "@main/push/deliver";
import type { PushDelivery, PushSender } from "@main/push/webPush";
import { type PushSubscription, PushSubscriptions } from "@main/store/push";
import { Settings } from "@main/store/settings";

const VAPID = { publicKey: "public-key", privateKey: "private-key" };

const PAYLOAD = attentionPushPayload({ shellId: "shell-a", title: "Rewrite the parser" });

function subscription(endpoint: string): PushSubscription {
	return { endpoint, keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` } };
}

function sender(outcomes: Record<string, PushDelivery> = {}) {
	const sent: PushSubscription[] = [];
	const send: PushSender = async ({ subscription: target }) => {
		sent.push(target);

		return outcomes[target.endpoint] ?? "sent";
	};

	return { send, sent };
}

test("a phone that re-syncs keeps a single subscription for its endpoint", async () => {
	await PushSubscriptions.save(subscription("https://push.example/a"));
	await PushSubscriptions.save({
		endpoint: "https://push.example/a",
		keys: { p256dh: "rotated", auth: "rotated" },
	});

	const stored = await PushSubscriptions.list();

	expect(stored).toHaveLength(1);
	expect(stored[0]?.keys).toEqual({ p256dh: "rotated", auth: "rotated" });
});

test("the notification reaches every subscribed phone", async () => {
	await PushSubscriptions.save(subscription("https://push.example/a"));
	await PushSubscriptions.save(subscription("https://push.example/b"));
	const { send, sent } = sender();

	const deliveries = await deliverAttentionPush({ payload: PAYLOAD, vapid: VAPID, send });

	expect(deliveries).toEqual(["sent", "sent"]);
	expect(sent.map((target) => target.endpoint)).toEqual(["https://push.example/a", "https://push.example/b"]);
	expect(sent[0]?.keys).toEqual(subscription("https://push.example/a").keys);
});

test("a subscription the push service no longer knows is dropped", async () => {
	await PushSubscriptions.save(subscription("https://push.example/dead"));
	await PushSubscriptions.save(subscription("https://push.example/alive"));
	const { send } = sender({ "https://push.example/dead": "gone" });

	await deliverAttentionPush({ payload: PAYLOAD, vapid: VAPID, send });

	expect((await PushSubscriptions.list()).map((stored) => stored.endpoint)).toEqual(["https://push.example/alive"]);
});

test("a push service that failed keeps the subscription for the next attempt", async () => {
	await PushSubscriptions.save(subscription("https://push.example/flaky"));
	const { send } = sender({ "https://push.example/flaky": "failed" });

	await deliverAttentionPush({ payload: PAYLOAD, vapid: VAPID, send });

	expect(await PushSubscriptions.list()).toHaveLength(1);
});

test("a shell someone is already looking at sends nothing", async () => {
	await PushSubscriptions.save(subscription("https://push.example/watching"));
	focusShell({ id: "watcher", onClose: () => {} }, "shell-watched");

	await pushNeedsAttention({ projectId: "p1", shellId: "shell-watched" });

	expect((await Settings.get()).vapid).toBeUndefined();
});

test("removing a subscription leaves the others reachable", async () => {
	await PushSubscriptions.save(subscription("https://push.example/a"));
	await PushSubscriptions.save(subscription("https://push.example/b"));

	await PushSubscriptions.remove("https://push.example/a");

	expect((await PushSubscriptions.list()).map((stored) => stored.endpoint)).toEqual(["https://push.example/b"]);
});
