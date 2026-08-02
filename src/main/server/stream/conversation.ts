import { releaseWatch, replaceWatch } from "@main/server/stream/connectionWatches";
import { ConversationWatch } from "@main/server/stream/ConversationWatch";
import { ConversationSchemas } from "@main/server/stream/messages";
import type { StreamConnection } from "@main/server/stream/connection";
import type { ConversationAddress } from "@shared/conversation";
import type { StreamEnvelope } from "@shared/stream";

const conversationWatches = new Map<string, ConversationWatch>();

function addressKey(address: ConversationAddress): string {
	return `${address.shellId} ${address.agent ?? ""}`;
}

function watchKey(connection: StreamConnection, address: ConversationAddress): string {
	return `${connection.id} ${addressKey(address)}`;
}

export function handleConversationMessage(connection: StreamConnection, message: StreamEnvelope): unknown {
	if (message.type === "history") {
		const { before, ...address } = ConversationSchemas.history.assert(message.payload);

		return conversationWatches.get(watchKey(connection, address))?.history(before);
	}

	const address = ConversationSchemas.shell.assert(message.payload);
	const key = watchKey(connection, address);

	switch (message.type) {
		case "subscribe": {
			const watch = new ConversationWatch(connection, address);
			replaceWatch({ connection, channel: "conversation", key: addressKey(address) }, () => {
				watch.stop();

				if (conversationWatches.get(key) === watch) {
					conversationWatches.delete(key);
				}
			});
			conversationWatches.set(key, watch);

			return watch.start();
		}
		case "unsubscribe":
			releaseWatch({ connection, channel: "conversation", key: addressKey(address) });

			return undefined;
		default:
			throw new Error(`Unknown conversation message "${message.type}"`);
	}
}
