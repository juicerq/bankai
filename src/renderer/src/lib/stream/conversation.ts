import { streamSocket } from "@renderer/lib/stream/socket";
import type { BankaiConversationApi, ConversationSnapshot } from "@shared/conversation";

export const conversationStream: BankaiConversationApi = {
	subscribe: (shellId) => streamSocket.request<ConversationSnapshot>("conversation", "subscribe", { shellId }),
	history: async (shellId, before) => {
		await streamSocket.request("conversation", "history", { shellId, before });
	},
	unsubscribe: (shellId) => streamSocket.send("conversation", "unsubscribe", { shellId }),
	onAppended: (listener) => streamSocket.on("conversation", "appended", listener),
	onReset: (listener) => streamSocket.on("conversation", "reset", listener),
};
