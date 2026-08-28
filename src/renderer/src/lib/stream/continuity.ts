import { streamSocket } from "@renderer/lib/stream/socket";
import { type BankaiContinuityApi, continuityChangedEventSchema } from "@shared/continuity";

export const continuityStream: BankaiContinuityApi = {
	subscribe: () => streamSocket.send("continuity", "subscribe"),
	onChanged: (listener) => streamSocket.on("continuity", "changed", continuityChangedEventSchema, listener),
};
