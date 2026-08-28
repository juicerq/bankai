import { streamSocket } from "@renderer/lib/stream/socket";
import {
	type BankaiConversationApi,
	conversationAppendedEventSchema,
	conversationResetEventSchema,
	conversationSnapshotSchema,
} from "@shared/conversation";
import { streamVoidSchema } from "@shared/stream";

export const conversationStream: BankaiConversationApi = {
	subscribe: (address) => streamSocket.request("conversation", "subscribe", address, conversationSnapshotSchema),
	history: async (address, before) => {
		await streamSocket.request("conversation", "history", { ...address, before }, streamVoidSchema);
	},
	unsubscribe: (address) => streamSocket.send("conversation", "unsubscribe", address),
	onAppended: (listener) => streamSocket.on("conversation", "appended", conversationAppendedEventSchema, listener),
	onReset: (listener) => streamSocket.on("conversation", "reset", conversationResetEventSchema, listener),
};
