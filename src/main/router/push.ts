import { type } from "arktype";
import { base } from "@main/router/base";
import { vapidKeys } from "@main/push/webPush";
import { PushSubscriptions, pushSubscriptionSchema } from "@main/store/push";

export const pushRouter = {
	getPublicKey: base.handler(async () => (await vapidKeys()).publicKey),
	subscribe: base.input(pushSubscriptionSchema).handler(({ input }) => PushSubscriptions.save(input)),
	unsubscribe: base
		.input(type({ endpoint: "string" }))
		.handler(({ input }) => PushSubscriptions.remove(input.endpoint)),
};
