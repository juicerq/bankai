import { orpc } from "@renderer/lib/api";
import { queryClient } from "@renderer/lib/query-client";

type ResyncStage = "watch" | "terminal";

type ResyncHandler = () => void | Promise<void>;

class StreamResync {
	private readonly handlers: Record<ResyncStage, Set<ResyncHandler>> = {
		watch: new Set(),
		terminal: new Set(),
	};

	register(stage: ResyncStage, handler: ResyncHandler): () => void {
		this.handlers[stage].add(handler);

		return () => {
			this.handlers[stage].delete(handler);
		};
	}

	async run(): Promise<void> {
		await this.runStage("watch");

		const refetched = Promise.all(
			unwatchedKeys().map((queryKey) => queryClient.invalidateQueries({ queryKey })),
		);

		await this.runStage("terminal");
		await refetched;
	}

	private async runStage(stage: ResyncStage): Promise<void> {
		await Promise.all([...this.handlers[stage]].map(async (handler) => {
			try {
				await handler();
			} catch (err) {
				console.error(`Failed to resync a ${stage} subscription`, err);
			}
		}));
	}
}

function unwatchedKeys() {
	return [
		orpc.projects.key(),
		orpc.settings.key(),
		orpc.todos.key(),
		orpc.favorites.key(),
		orpc.commands.key(),
		orpc.mobile.key(),
		orpc.review.key(),
	];
}

export const streamResync = new StreamResync();
