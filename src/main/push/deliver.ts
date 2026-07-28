import type { AttentionPushPayload } from "@main/push/attention";
import type { PushDelivery, PushSender } from "@main/push/webPush";
import { PushSubscriptions } from "@main/store/push";
import type { VapidKeys } from "@main/store/settings";

export async function deliverAttentionPush(input: {
	payload: AttentionPushPayload;
	vapid: VapidKeys;
	send: PushSender;
}): Promise<PushDelivery[]> {
	const subscriptions = await PushSubscriptions.list();
	const deliveries = await Promise.all(
		subscriptions.map(async ({ endpoint, keys }) => ({
			endpoint,
			delivery: await input.send({
				subscription: { endpoint, keys },
				payload: input.payload,
				vapid: input.vapid,
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
