import webpush from "web-push";
import { Logger } from "@main/infra/logger";
import { type AttentionPushPayload, subscriptionGone } from "@main/push/attention-push";
import type { PushSubscription } from "@main/store/push-subscriptions";
import { Settings, type VapidKeys } from "@main/store/settings";

const VAPID_SUBJECT = "https://github.com/juicerq/bankai";

const PUSH_TTL_SECONDS = 600;

const ENDPOINT_TAIL_CHARS = 8;

export type PushDelivery = "sent" | "gone" | "failed";

export type PushSender = (input: {
	subscription: PushSubscription;
	payload: AttentionPushPayload;
	vapid: VapidKeys;
}) => Promise<PushDelivery>;

export const sendWebPush: PushSender = async ({ subscription, payload, vapid }) => {
	try {
		await webpush.sendNotification(subscription, JSON.stringify(payload), {
			TTL: PUSH_TTL_SECONDS,
			urgency: "high",
			vapidDetails: {
				subject: VAPID_SUBJECT,
				publicKey: vapid.publicKey,
				privateKey: vapid.privateKey,
			},
		});

		return "sent";
	} catch (err) {
		const statusCode = err instanceof webpush.WebPushError ? err.statusCode : undefined;

		if (subscriptionGone(statusCode)) {
			return "gone";
		}

		Logger.warn("push:send-failed", {
			endpoint: endpointLabel(subscription.endpoint),
			statusCode,
			err: String(err),
		});

		return "failed";
	}
};

function endpointLabel(endpoint: string): string {
	return `${URL.parse(endpoint)?.origin ?? "unknown"}/…${endpoint.slice(-ENDPOINT_TAIL_CHARS)}`;
}

export function vapidKeys(): Promise<VapidKeys> {
	return Settings.ensureVapid(() => webpush.generateVAPIDKeys());
}
