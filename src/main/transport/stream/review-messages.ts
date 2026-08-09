import { ProjectWorktrees } from "@main/git/worktree/project-worktrees";
import { ReviewChanges } from "@main/git/review/review-changes";
import type { StreamConnection } from "@main/transport/stream/stream-connection";
import { ConnectionWatches } from "@main/transport/stream/connection-watches";
import { ReviewSchemas } from "@main/transport/stream/stream-messages";
import type { ReviewChangedEvent } from "@shared/review";
import type { StreamEnvelope } from "@shared/stream";

function watchKey(input: { projectId: string; worktree?: string }): string {
	return `${input.projectId}\0${input.worktree ?? ""}`;
}

async function handleReviewMessage(
	connection: StreamConnection,
	message: StreamEnvelope,
): Promise<unknown> {
	switch (message.type) {
		case "watch": {
			const input = ReviewSchemas.watch.assert(message.payload);
			const worktree = await ProjectWorktrees.resolve(input);

			await ConnectionWatches.retain({ connection, channel: "review", key: watchKey(input) }, async () =>
				ReviewChanges.subscribe(worktree, () => {
					connection.send("review", "changed", {
						projectId: input.projectId,
						worktree,
					} satisfies ReviewChangedEvent);
				}),
			);

			return undefined;
		}
		case "unwatch": {
			const key = watchKey(ReviewSchemas.watch.assert(message.payload));
			ConnectionWatches.release({ connection, channel: "review", key });

			return undefined;
		}
		default:
			throw new Error(`Unknown review message "${message.type}"`);
	}
}

export const ReviewMessages = {
	handle: handleReviewMessage,
};
