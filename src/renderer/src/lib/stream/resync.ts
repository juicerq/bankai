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

		const refetched = queryClient.invalidateQueries();

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

export const streamResync = new StreamResync();
