import { useMemo, useSyncExternalStore } from "react";
import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";

export function useMarkViewed(shellId: string) {
	const marker = useMemo(() => new ViewedMarker(shellId), [shellId]);

	useSyncExternalStore(marker.subscribe, marker.getSnapshot);
}

class ViewedMarker {
	constructor(private readonly shellId: string) {}

	readonly getSnapshot = () => this.shellId;

	readonly subscribe = () => {
		const stopResync = streamResync.register("watch", this.mark);

		this.mark();
		document.addEventListener("visibilitychange", this.mark);

		return () => {
			stopResync();
			document.removeEventListener("visibilitychange", this.mark);
		};
	};

	private readonly mark = () => {
		if (document.visibilityState === "visible") {
			activityStream.markShellViewed(this.shellId);
		}
	};
}
