import type { StreamConnection } from "@main/server/stream/connection";
import { replaceWatch } from "@main/server/stream/connectionWatches";
import { Continuity, type ContinuityValue } from "@main/store/continuity";
import type { ContinuityChangedEvent } from "@shared/continuity";
import type { StreamEnvelope } from "@shared/stream";

export async function handleContinuityMessage(
	connection: StreamConnection,
	message: StreamEnvelope,
): Promise<unknown> {
	if (message.type !== "subscribe") {
		throw new Error(`Unknown continuity message "${message.type}"`);
	}

	replaceWatch(
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
