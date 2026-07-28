import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiConversationApi, ConversationSnapshot } from "@shared/conversation";

export const conversationStream: BankaiConversationApi = {
	subscribe: (address) => streamSocket.request<ConversationSnapshot>("conversation", "subscribe", address),
	history: async (address, before) => {
		await streamSocket.request("conversation", "history", { ...address, before });
	},
	unsubscribe: (address) => streamSocket.send("conversation", "unsubscribe", address),
	onAppended: (listener) => streamSocket.on("conversation", "appended", listener),
	onReset: (listener) => streamSocket.on("conversation", "reset", listener),
};
