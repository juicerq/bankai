import { type } from "arktype";
import { Store } from "@core/store/Store";
import { type SessionRef, sessionKey } from "@core/harness/registry";

const reviewStateContract = type({ "[string]": "string[]" });

type ReviewStateValue = typeof reviewStateContract.infer;

const store = new Store({
	name: "reviewState",
	version: 2,
	contract: reviewStateContract,
	migrators: {
		1: (raw) => Object.fromEntries(
			Object.entries(reviewStateContract.assert(raw)).map(([key, value]) => [`claude:${key}`, value]),
		),
	},
	seed: (): ReviewStateValue => ({}),
});

export const ReviewState = {
	get: async (session: SessionRef) => (await store.read())[sessionKey(session)] ?? [],
	toggle: async (session: SessionRef, turnId: string) => {
		const key = sessionKey(session);
		const next = await store.mutate((current) => {
			const existing = current[key] ?? [];
			const reviewedTurnIds = existing.includes(turnId)
				? existing.filter((id) => id !== turnId)
				: [...existing, turnId];

			return { ...current, [key]: reviewedTurnIds };
		});

		return next[key] ?? [];
	},
};
