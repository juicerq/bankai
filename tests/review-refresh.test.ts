import { expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { BankaiReviewApi, ReviewChangedEvent } from "@shared/review";

let notifyChange: ((event: ReviewChangedEvent) => void) | undefined;

const reviewApi: BankaiReviewApi = {
	watch: async () => {},
	unwatch: () => {},
	onChanged: (listener) => {
		notifyChange = listener;
		return () => {
			notifyChange = undefined;
		};
	},
};

globalThis.window = { postMessage: () => {}, bankaiReview: reviewApi } as unknown as Window & typeof globalThis;

const { ReviewQueryObserver } = await import("@renderer/routes/-utils/use-review-changes");
const { orpc } = await import("@renderer/lib/api");

it("folds change bursts into a single follow-up refresh", async () => {
	const queryClient = new QueryClient();
	let reads = 0;
	let blockReads = false;
	const blockedReads: (() => void)[] = [];
	const snapshotObserver = new QueryObserver(queryClient, {
		queryKey: orpc.review.snapshot.key({ type: "query", input: { projectId: "project-1", mode: "uncommitted" } }),
		queryFn: async () => {
			reads += 1;
			if (blockReads) {
				await new Promise<void>((resolve) => {
					blockedReads.push(resolve);
				});
			}

			return { isRepo: false };
		},
	});
	const stopObserving = snapshotObserver.subscribe(() => {});
	const review = new ReviewQueryObserver("project-1", queryClient);
	let state = review.getSnapshot();
	const stopWatching = review.subscribe(() => {
		state = review.getSnapshot();
	});

	try {
		await until(() => state.status === "ready" && queryClient.isFetching() === 0);
		const settledReads = reads;

		blockReads = true;
		notifyChange?.({ projectId: "project-1" });
		await until(() => reads === settledReads + 1);

		for (let burst = 0; burst < 5; burst += 1) {
			notifyChange?.({ projectId: "project-1" });
		}

		blockReads = false;
		for (const release of blockedReads) {
			release();
		}

		await until(() => reads === settledReads + 2);
		await Bun.sleep(50);
		expect(reads).toBe(settledReads + 2);
		expect(queryClient.isFetching()).toBe(0);
	} finally {
		stopWatching();
		stopObserving();
	}
});

async function until(condition: () => boolean) {
	const deadline = Date.now() + 2000;

	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for condition");
		}

		await Bun.sleep(5);
	}
}
