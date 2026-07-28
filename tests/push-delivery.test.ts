import { expect, test } from "bun:test";
import { focusShell } from "@main/activity/ShellFocus";
import { attentionPushPayload } from "@main/push/attention";
import { pushNeedsAttention } from "@main/push/notifyAttention";
import { deliverAttentionPush } from "@main/push/deliver";
import type { PushDelivery, PushSender } from "@main/push/webPush";
import {
	PUSH_SUBSCRIPTION_CAP,
	type PushSubscription,
	pushSubscriptionSchema,
	PushSubscriptions,
} from "@main/store/push";

const vapid = async () => ({ publicKey: "public-key", privateKey: "private-key" });

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

	const deliveries = await deliverAttentionPush({ payload: PAYLOAD, vapid, send });

	expect(deliveries).toEqual(["sent", "sent"]);
	expect(sent.map((target) => target.endpoint)).toEqual(["https://push.example/a", "https://push.example/b"]);
	expect(sent[0]?.keys).toEqual(subscription("https://push.example/a").keys);
});

test("a subscription the push service no longer knows is dropped", async () => {
	await PushSubscriptions.save(subscription("https://push.example/dead"));
	await PushSubscriptions.save(subscription("https://push.example/alive"));
	const { send } = sender({ "https://push.example/dead": "gone" });

	await deliverAttentionPush({ payload: PAYLOAD, vapid, send });

	expect((await PushSubscriptions.list()).map((stored) => stored.endpoint)).toEqual(["https://push.example/alive"]);
});

test("a push service that failed keeps the subscription for the next attempt", async () => {
	await PushSubscriptions.save(subscription("https://push.example/flaky"));
	const { send } = sender({ "https://push.example/flaky": "failed" });

	await deliverAttentionPush({ payload: PAYLOAD, vapid, send });

	expect(await PushSubscriptions.list()).toHaveLength(1);
});

test("a shell someone is already looking at sends nothing", async () => {
	await PushSubscriptions.save(subscription("https://push.example/watching"));
	const cleanups: (() => void)[] = [];
	const { send, sent } = sender();
	focusShell({ id: "watcher", onClose: (cleanup) => cleanups.push(cleanup) }, "shell-watched");

	await pushNeedsAttention({ projectId: "p1", shellId: "shell-watched" }, send);

	expect(sent).toEqual([]);

	for (const cleanup of cleanups) {
		cleanup();
	}
});

test("only the subscription fields a phone is allowed to send are stored", async () => {
	await PushSubscriptions.save(
		pushSubscriptionSchema.assert({
			endpoint: "https://push.example/curious",
			keys: { p256dh: "p", auth: "a", stash: "x".repeat(64) },
			stash: "y".repeat(64),
		}),
	);

	const [stored] = await PushSubscriptions.list();

	expect(stored).toEqual({
		endpoint: "https://push.example/curious",
		keys: { p256dh: "p", auth: "a" },
		savedAt: expect.any(Number),
	});
});

test("the oldest phone falls off once the stored list is full", async () => {
	for (let index = 0; index <= PUSH_SUBSCRIPTION_CAP; index++) {
		await PushSubscriptions.save(subscription(`https://push.example/${index}`));
	}

	const stored = await PushSubscriptions.list();

	expect(stored).toHaveLength(PUSH_SUBSCRIPTION_CAP);
	expect(stored.map((entry) => entry.endpoint)).not.toContain("https://push.example/0");
	expect(stored.at(-1)?.endpoint).toBe(`https://push.example/${PUSH_SUBSCRIPTION_CAP}`);
});

test("removing a subscription leaves the others reachable", async () => {
	await PushSubscriptions.save(subscription("https://push.example/a"));
	await PushSubscriptions.save(subscription("https://push.example/b"));

	await PushSubscriptions.remove("https://push.example/a");

	expect((await PushSubscriptions.list()).map((stored) => stored.endpoint)).toEqual(["https://push.example/b"]);
});
