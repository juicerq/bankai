import { type } from "arktype";
import { Store } from "@main/store/Store";

const reviewStateContract = type({ "[string]": "string[]" });

type ReviewStateValue = typeof reviewStateContract.infer;

const store = new Store({
	name: "reviewState",
	version: 1,
	contract: reviewStateContract,
	migrators: {},
	seed: (): ReviewStateValue => ({}),
});

interface SetReviewedInput {
	sessionId: string;
	turnId: string;
	reviewed: boolean;
}

export const ReviewState = {
	get: async (sessionId: string) => (await store.read())[sessionId] ?? [],
	setReviewed: async (input: SetReviewedInput) => {
		const next = await store.mutate((current) => {
			const existing = current[input.sessionId] ?? [];
			const reviewedTurnIds = input.reviewed
				? existing.includes(input.turnId)
					? existing
					: [...existing, input.turnId]
				: existing.filter((id) => id !== input.turnId);

			return { ...current, [input.sessionId]: reviewedTurnIds };
		});

		return next[input.sessionId] ?? [];
	},
};
