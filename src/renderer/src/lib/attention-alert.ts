import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";

export function installDesktopAttention(): () => void {
	const desktop = window.bankaiDesktop;

	if (!desktop) {
		return () => {};
	}

	const stopListening = activityStream.onAttention(({ reason, count }) => desktop.attention(reason, count));
	const stopResync = streamResync.register("watch", () => activityStream.watchAttention());

	activityStream.watchAttention();

	return () => {
		stopListening();
		stopResync();
	};
}
