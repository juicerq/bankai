import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { orpc } from "@renderer/lib/api";

const DO_NOT_SUBSCRIBE = () => () => {};
const INACTIVE = { status: "inactive" } as const;
const PENDING = { status: "pending" } as const;
const GET_INACTIVE = () => INACTIVE;

type ReviewWatchState =
	| typeof INACTIVE
	| typeof PENDING
	| { status: "ready" }
	| { status: "error"; error: string };

export function useReviewChanges(projectId: string, active: boolean) {
	const queryClient = useQueryClient();
	const observer = useMemo(
		() => new ReviewQueryObserver(projectId, queryClient),
		[projectId, queryClient],
	);

	return useSyncExternalStore(
		active ? observer.subscribe : DO_NOT_SUBSCRIBE,
		active ? observer.getSnapshot : GET_INACTIVE,
		GET_INACTIVE,
	);
}

class ReviewQueryObserver {
	private state: ReviewWatchState = PENDING;
	private generation = 0;

	constructor(
		private readonly projectId: string,
		private readonly queryClient: QueryClient,
	) {}

	readonly getSnapshot = () => this.state;

	readonly subscribe = (notify: () => void) => {
		const generation = ++this.generation;
		let watching = false;
		this.state = PENDING;
		const stopListening = window.bankaiReview.onChanged((event) => {
			if (event.projectId === this.projectId) {
				this.refresh().catch((err) => console.error("Failed to refresh review changes", err));
			}
		});

		window.bankaiReview.watch(this.projectId)
			.then(async () => {
				watching = true;
				if (generation !== this.generation) {
					window.bankaiReview.unwatch(this.projectId);
					return;
				}

				await this.refresh();
				if (generation !== this.generation) {
					return;
				}

				this.state = { status: "ready" };
				notify();
			})
			.catch((err) => {
				if (generation !== this.generation) {
					return;
				}

				this.state = { status: "error", error: String(err) };
				notify();
			});

		return () => {
			this.generation += 1;
			this.state = PENDING;
			stopListening();
			if (watching) {
				window.bankaiReview.unwatch(this.projectId);
			}
		};
	};

	private async refresh() {
		const filters = [
			{ queryKey: orpc.review.snapshot.key({ type: "query", input: { projectId: this.projectId } }) },
			{ queryKey: orpc.review.file.key({ type: "query", input: { projectId: this.projectId } }) },
			{ queryKey: orpc.review.fullFile.key({ type: "query", input: { projectId: this.projectId } }) },
		];
		await Promise.all(filters.map((filter) => this.queryClient.cancelQueries(filter)));
		await Promise.all(filters.map((filter) => this.queryClient.invalidateQueries(filter)));
	}
}
