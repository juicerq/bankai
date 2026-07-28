import { client } from "@renderer/lib/api";
import { isBrowserClient } from "@renderer/lib/platform";
import { reach } from "@renderer/lib/reach";

export type PushPermission = NotificationPermission | "unsupported";

export function pushPermission(): PushPermission {
	if (!isBrowserClient() || !("Notification" in window) || !("PushManager" in window)) {
		return "unsupported";
	}

	if (!window.isSecureContext) {
		return "unsupported";
	}

	return Notification.permission;
}

export function installPushSync(): void {
	if (pushPermission() !== "granted") {
		return;
	}

	syncPushSubscription().catch((err) => {
		console.error("push subscription sync failed", err);
	});
}

export async function enablePushNotifications(): Promise<PushPermission> {
	const permission = await Notification.requestPermission();

	if (permission === "granted") {
		await syncPushSubscription();
	}

	return permission;
}

async function syncPushSubscription(): Promise<void> {
	const { token } = await reach();

	if (!token) {
		return;
	}

	const registration = await navigator.serviceWorker.ready;
	const applicationServerKey = decodeVapidKey(await client.push.getPublicKey());
	const existing = await registration.pushManager.getSubscription();
	const subscription = existing && subscribedWithKey(existing, applicationServerKey)
		? existing
		: await resubscribe(registration.pushManager, existing, applicationServerKey);

	await client.push.subscribe(readSubscription(subscription));
}

async function resubscribe(
	pushManager: PushManager,
	existing: PushSubscription | null,
	applicationServerKey: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
	await existing?.unsubscribe();

	return pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
}

function subscribedWithKey(subscription: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
	const subscribed = subscription.options.applicationServerKey;

	if (!subscribed) {
		return false;
	}

	const bytes = new Uint8Array(subscribed);

	return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

function readSubscription(subscription: PushSubscription): {
	endpoint: string;
	keys: { p256dh: string; auth: string };
} {
	const { endpoint, keys } = subscription.toJSON();

	if (!endpoint || !keys?.p256dh || !keys.auth) {
		throw new Error("The push subscription has no endpoint or keys");
	}

	return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function decodeVapidKey(key: string): Uint8Array<ArrayBuffer> {
	const padded = key.padEnd(key.length + ((4 - (key.length % 4)) % 4), "=");
	const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}
