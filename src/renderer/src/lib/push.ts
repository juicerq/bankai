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
	const existing = await registration.pushManager.getSubscription();
	const subscription = existing ?? (await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: decodeVapidKey(await client.push.getPublicKey()),
	}));

	await client.push.subscribe(readSubscription(subscription));
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
