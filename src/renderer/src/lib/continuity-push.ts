import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";
import { continuityStream } from "@renderer/lib/stream/continuity";
import { streamResync } from "@renderer/lib/stream/resync";

export function installContinuityPush({ queryClient }: { queryClient: QueryClient }) {
	const { queryKey } = orpc.continuity.get.queryOptions();

	const stopListening = continuityStream.onChanged((event) => {
		queryClient.setQueryData(queryKey, (previous) => ({
			value: event.value,
			failed: previous?.failed ?? false,
		}));
	});
	const stopResync = streamResync.register("watch", () => continuityStream.subscribe());

	continuityStream.subscribe();

	return () => {
		stopListening();
		stopResync();
	};
}
