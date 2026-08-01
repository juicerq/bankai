import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";
import { servicesStream } from "@renderer/lib/stream/services";
import { streamResync } from "@renderer/lib/stream/resync";

export function installServicesPush({ queryClient }: { queryClient: QueryClient }) {
	const { queryKey } = orpc.services.list.queryOptions();

	const stopListening = servicesStream.onChanged((event) => {
		queryClient.setQueryData(queryKey, event.states);
	});
	const stopResync = streamResync.register("watch", () => servicesStream.subscribe());

	servicesStream.subscribe();

	return () => {
		stopListening();
		stopResync();
	};
}
