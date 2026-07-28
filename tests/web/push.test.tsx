import { type PushTransport, setPushTransport } from "./orpc-transport";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { decodeVapidKey, installPushSync } from "@renderer/lib/push";
import { MobilePushBanner } from "@renderer/routes/mobile/-components/mobile-push-banner";
import { SERVER_TOKEN_STORAGE_KEY } from "@shared/server";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

const PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

const EXISTING_ENDPOINT = "https://push.example/existing";

const NEW_ENDPOINT = "https://push.example/new";

let transport: PushTransport;
let pushManager: FakePushManager;

class FakePushManager {
	readonly subscribeCalls: PushSubscriptionOptionsInit[] = [];
	private subscription: unknown;

	constructor(endpoint?: string) {
		this.subscription = endpoint ? fakeSubscription(endpoint) : undefined;
	}

	readonly getSubscription = async () => this.subscription ?? null;

	readonly subscribe = async (options: PushSubscriptionOptionsInit) => {
		this.subscribeCalls.push(options);
		this.subscription = fakeSubscription(NEW_ENDPOINT);

		return this.subscription;
	};
}

function fakeSubscription(endpoint: string) {
	return {
		endpoint,
		toJSON: () => ({ endpoint, keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` } }),
	};
}

function installBrowser(options: {
	permission?: NotificationPermission | "unsupported";
	granted?: NotificationPermission;
	endpoint?: string;
}) {
	pushManager = new FakePushManager(options.endpoint);

	Object.defineProperty(navigator, "serviceWorker", {
		configurable: true,
		value: { ready: Promise.resolve({ pushManager }) },
	});
	Object.defineProperty(window, "PushManager", { configurable: true, value: FakePushManager });

	if (options.permission === "unsupported") {
		Reflect.deleteProperty(window, "Notification");

		return;
	}

	Object.defineProperty(window, "Notification", {
		configurable: true,
		value: {
			permission: options.permission ?? "default",
			requestPermission: async () => options.granted ?? "granted",
		},
	});
}

beforeEach(() => {
	transport = { publicKey: PUBLIC_KEY, subscriptions: [] };
	setPushTransport(transport);
	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, "paired-token");
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

test("the banner offers notifications while the phone has not decided", () => {
	installBrowser({ permission: "default" });
	render(<MobilePushBanner />);

	expect(slot(get("mobile-push-banner"), "enable")).not.toBeNull();
});

test("a phone that already granted notifications sees no banner", () => {
	installBrowser({ permission: "granted" });
	render(<MobilePushBanner />);

	expect(query("mobile-push-banner")).toBeNull();
});

test("a phone that denied notifications is not nagged", () => {
	installBrowser({ permission: "denied" });
	render(<MobilePushBanner />);

	expect(query("mobile-push-banner")).toBeNull();
});

test("a client without push support sees no banner", () => {
	installBrowser({ permission: "unsupported" });
	render(<MobilePushBanner />);

	expect(query("mobile-push-banner")).toBeNull();
});

test("granting from the banner subscribes the phone and hides the banner", async () => {
	installBrowser({ permission: "default", granted: "granted" });
	render(<MobilePushBanner />);

	fireEvent.click(slot(get("mobile-push-banner"), "enable"));

	await waitFor(() => {
		expect(query("mobile-push-banner")).toBeNull();
	});
	expect(transport.subscriptions).toEqual([
		{ endpoint: NEW_ENDPOINT, keys: { p256dh: `p256dh-${NEW_ENDPOINT}`, auth: `auth-${NEW_ENDPOINT}` } },
	]);
	expect(pushManager.subscribeCalls[0]?.userVisibleOnly).toBe(true);
	expect(pushManager.subscribeCalls[0]?.applicationServerKey).toEqual(decodeVapidKey(PUBLIC_KEY));
});

test("a refused permission leaves the banner behind without subscribing", async () => {
	installBrowser({ permission: "default", granted: "denied" });
	render(<MobilePushBanner />);

	fireEvent.click(slot(get("mobile-push-banner"), "enable"));

	await waitFor(() => {
		expect(query("mobile-push-banner")).toBeNull();
	});
	expect(transport.subscriptions).toEqual([]);
	expect(pushManager.subscribeCalls).toEqual([]);
});

test("opening the app again re-syncs the subscription the phone already has", async () => {
	installBrowser({ permission: "granted", endpoint: EXISTING_ENDPOINT });

	installPushSync();

	await waitFor(() => {
		expect(transport.subscriptions).toHaveLength(1);
	});
	expect(transport.subscriptions[0]?.endpoint).toBe(EXISTING_ENDPOINT);
	expect(pushManager.subscribeCalls).toEqual([]);
});

test("an unpaired browser syncs nothing", async () => {
	installBrowser({ permission: "granted", endpoint: EXISTING_ENDPOINT });
	localStorage.clear();

	installPushSync();
	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, "paired-token");
	installPushSync();

	await waitFor(() => {
		expect(transport.subscriptions).toHaveLength(1);
	});
	expect(transport.subscriptions[0]?.endpoint).toBe(EXISTING_ENDPOINT);
});
