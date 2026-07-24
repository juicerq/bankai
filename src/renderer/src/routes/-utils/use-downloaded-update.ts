import { useMemo, useSyncExternalStore } from "react";
import type { UpdateDownloadedEvent } from "@shared/update";

export function useDownloadedUpdate(): UpdateDownloadedEvent | null {
	const observer = useMemo(() => new DownloadedUpdateObserver(), []);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class DownloadedUpdateObserver {
	private snapshot: UpdateDownloadedEvent | null = null;
	private notify: (() => void) | undefined;

	readonly getSnapshot = () => this.snapshot;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;
		const stopListening = window.bankaiUpdate.onDownloaded((event) => this.set(event));

		window.bankaiUpdate.getPending()
			.then((pending) => {
				if (pending) {
					this.set(pending);
				}
			})
			.catch((err) => console.error("Failed to read pending update", err));

		return () => {
			stopListening();
			this.notify = undefined;
		};
	};

	private set(event: UpdateDownloadedEvent) {
		this.snapshot = event;
		this.notify?.();
	}
}
