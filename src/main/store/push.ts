import { type } from "arktype";
import { Store } from "@main/store/Store";

export const PUSH_SUBSCRIPTION_CAP = 8;

export const pushSubscriptionSchema = type({
	endpoint: "string",
	keys: {
		p256dh: "string",
		auth: "string",
		"+": "delete",
	},
	"+": "delete",
});
export type PushSubscription = typeof pushSubscriptionSchema.infer;

const storedSubscriptionSchema = pushSubscriptionSchema.merge({ savedAt: "number", "+": "delete" });
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
			]
				.sort((one, other) => one.savedAt - other.savedAt)
				.slice(-PUSH_SUBSCRIPTION_CAP),
		}));
	},

	remove: async (endpoint: string): Promise<void> => {
		await store.mutate((current) => ({
			subscriptions: current.subscriptions.filter((stored) => stored.endpoint !== endpoint),
		}));
	},
};
