import type { StreamConnection } from "@main/transport/stream/stream-connection";
import { ConnectionWatches } from "@main/transport/stream/connection-watches";
import { Continuity } from "@main/store/continuity";
import type { ContinuityChangedEvent, ContinuityValue } from "@shared/continuity";
import type { StreamEnvelope } from "@shared/stream";

async function handleContinuityMessage(
	connection: StreamConnection,
	message: StreamEnvelope,
): Promise<unknown> {
	if (message.type !== "subscribe") {
		throw new Error(`Unknown continuity message "${message.type}"`);
	}

	ConnectionWatches.replace(
		{ connection, channel: "continuity", key: "" },
		Continuity.subscribe((value) => push(connection, value)),
	);

	const { value } = await Continuity.load();
	push(connection, value);

	return value;
}

function push(connection: StreamConnection, value: ContinuityValue): void {
	connection.send("continuity", "changed", { value } satisfies ContinuityChangedEvent);
}

export const ContinuityMessages = {
	handle: handleContinuityMessage,
};
