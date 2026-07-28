export type StreamStatus = "connecting" | "open" | "reconnecting" | "outdated";

class StreamStatusStore {
	private status: StreamStatus = "connecting";
	private readonly watchers = new Set<() => void>();

	readonly get = (): StreamStatus => this.status;

	readonly subscribe = (notify: () => void) => {
		this.watchers.add(notify);

		return () => {
			this.watchers.delete(notify);
		};
	};

	set(status: StreamStatus): void {
		if (status === this.status) {
			return;
		}

		this.status = status;
		for (const notify of this.watchers) {
			notify();
		}
	}
}

export const streamStatus = new StreamStatusStore();
