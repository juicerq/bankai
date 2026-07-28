import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiReviewApi } from "@shared/review";

export const reviewStream: BankaiReviewApi = {
	watch: async (input) => {
		await streamSocket.request("review", "watch", input);
	},
	unwatch: (input) => streamSocket.send("review", "unwatch", input),
	onChanged: (listener) => streamSocket.on("review", "changed", listener),
};
