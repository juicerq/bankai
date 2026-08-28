import { streamSocket } from "@renderer/lib/stream/socket";
import { type BankaiReviewApi, reviewChangedEventSchema } from "@shared/review";
import { streamVoidSchema } from "@shared/stream";

export const reviewStream: BankaiReviewApi = {
	watch: async (input) => {
		await streamSocket.request("review", "watch", input, streamVoidSchema);
	},
	unwatch: (input) => streamSocket.send("review", "unwatch", input),
	onChanged: (listener) => streamSocket.on("review", "changed", reviewChangedEventSchema, listener),
};
