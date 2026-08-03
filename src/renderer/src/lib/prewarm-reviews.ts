import type { ReviewMode } from "@main/git/git-contracts";
import { orpc } from "@renderer/lib/api";
import { matchQuery, type QueryClient } from "@tanstack/react-query";

export function installReviewPrewarm({ queryClient, mode }: { queryClient: QueryClient; mode: ReviewMode }) {
	const prewarmed = new Set<string>();
	const listOptions = orpc.projects.list.queryOptions();

	const prewarm = () => {
		const projects = queryClient.getQueryData(listOptions.queryKey);
		for (const project of projects ?? []) {
			if (prewarmed.has(project.id)) {
				continue;
			}

			prewarmed.add(project.id);
			queryClient
				.prefetchQuery(
					orpc.review.snapshot.queryOptions({
						input: { projectId: project.id, mode },
					}),
				)
				.catch((error) =>
					console.error("Failed to prewarm review snapshot", error),
				);
		}
	};

	prewarm();

	return queryClient.getQueryCache().subscribe((event) => {
		if (
			matchQuery({ queryKey: listOptions.queryKey, exact: true }, event.query)
		) {
			prewarm();
		}
	});
}
