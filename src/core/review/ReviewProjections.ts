import { type } from "arktype";
import { reviewTurn } from "@core/review/ReviewModel";
import { Store } from "@core/store/Store";

const projection = type({
	offset: "number",
	turns: reviewTurn.array(),
	"fileId?": { dev: "string", ino: "string" },
	"unavailable?": type.enumerated("historical", "unsafe"),
});
const projections = type({ "[string]": projection });

export type ReviewProjection = typeof projection.infer;

const store = new Store({
	name: "reviewProjections",
	version: 1,
	contract: projections,
	migrators: {},
	seed: (): typeof projections.infer => ({}),
});

export const ReviewProjections = {
	async get(key: string): Promise<ReviewProjection | undefined> {
		const projections = await store.read();
		return projections[key];
	},

	async set(key: string, value: ReviewProjection): Promise<void> {
		await store.mutate((current) => ({ ...current, [key]: value }));
	},
};
