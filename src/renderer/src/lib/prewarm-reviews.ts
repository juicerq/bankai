import type { ReviewMode } from "@shared/review";
import { orpc } from "@renderer/lib/api";
import { matchQuery, type QueryClient } from "@tanstack/react-query";

export function installReviewPrewarm({ queryClient, mode }: { queryClient: QueryClient; mode: ReviewMode }) {
	const listOptions = orpc.projects.list.queryOptions();

	const prewarm = (): boolean => {
		const projects = queryClient.getQueryData(listOptions.queryKey);
		if (!projects) {
			return false;
		}

		for (const project of projects) {
			queryClient
				.prefetchQuery(
					orpc.review.snapshot.queryOptions({
						input: { projectId: project.id, worktree: project.path, mode },
					}),
				)
				.catch((error) => console.error("Failed to prewarm review snapshot", error));
		}

		return true;
	};

	const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
		if (matchQuery({ queryKey: listOptions.queryKey, exact: true }, event.query) && prewarm()) {
			unsubscribe();
		}
	});

	if (prewarm()) {
		unsubscribe();
	}

	return unsubscribe;
}
