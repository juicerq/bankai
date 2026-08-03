import type { AttentionPushPayload } from "@main/push/attention-push";
import type { PushResult, PushSender } from "@main/push/web-push";
import { PushSubscriptions } from "@main/store/push-subscriptions";
import type { VapidKeys } from "@main/store/settings";

async function deliverAttentionPush(input: {
	payload: AttentionPushPayload;
	vapid: () => Promise<VapidKeys>;
	send: PushSender;
}): Promise<PushResult[]> {
	const subscriptions = await PushSubscriptions.list();
	if (subscriptions.length === 0) {
		return [];
	}

	const vapid = await input.vapid();
	const deliveries = await Promise.all(
		subscriptions.map(async ({ endpoint, keys }) => ({
			endpoint,
			delivery: await input.send({
				subscription: { endpoint, keys },
				payload: input.payload,
				vapid,
			}),
		})),
	);

	for (const { endpoint, delivery } of deliveries) {
		if (delivery === "gone") {
			await PushSubscriptions.remove(endpoint);
		}
	}

	return deliveries.map(({ delivery }) => delivery);
}

export const PushDelivery = {
	deliver: deliverAttentionPush,
};
