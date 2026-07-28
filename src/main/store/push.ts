import { type } from "arktype";
import { Store } from "@main/store/Store";

export const pushSubscriptionSchema = type({
	endpoint: "string",
	keys: {
		p256dh: "string",
		auth: "string",
	},
});
export type PushSubscription = typeof pushSubscriptionSchema.infer;

const storedSubscriptionSchema = pushSubscriptionSchema.and({ savedAt: "number" });
export type StoredPushSubscription = typeof storedSubscriptionSchema.infer;

const pushContract = type({ subscriptions: storedSubscriptionSchema.array() });

const store = new Store({
	name: "push",
	version: 1,
	contract: pushContract,
	migrators: {},
	seed: () => ({ subscriptions: [] }),
});

export const PushSubscriptions = {
	list: async (): Promise<StoredPushSubscription[]> => (await store.read()).subscriptions,

	save: async (subscription: PushSubscription): Promise<void> => {
		await store.mutate((current) => ({
			subscriptions: [
				...current.subscriptions.filter((stored) => stored.endpoint !== subscription.endpoint),
				{ ...subscription, savedAt: Date.now() },
			],
		}));
	},

	remove: async (endpoint: string): Promise<void> => {
		await store.mutate((current) => ({
			subscriptions: current.subscriptions.filter((stored) => stored.endpoint !== endpoint),
		}));
	},
};
