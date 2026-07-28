import { Logger } from "@main/logger";
import type { StreamConnection } from "@main/server/stream/connection";
import { Continuity, type ContinuityValue } from "@main/store/continuity";
import type { ContinuityChangedEvent } from "@shared/continuity";
import type { StreamEnvelope } from "@shared/stream";

const subscriptions = new Map<string, () => void>();

export function handleContinuityMessage(connection: StreamConnection, message: StreamEnvelope): unknown {
	if (message.type !== "subscribe") {
		throw new Error(`Unknown continuity message "${message.type}"`);
	}

	subscriptions.get(connection.id)?.();

	const stop = Continuity.subscribe((value) => push(connection, value));
	subscriptions.set(connection.id, stop);
	connection.onClose(() => {
		if (subscriptions.get(connection.id) === stop) {
			stop();
			subscriptions.delete(connection.id);
		}
	});

	Continuity.load()
		.then(({ value }) => push(connection, value))
		.catch((err) => Logger.error("continuity:seed-failed", { err: String(err) }));

	return undefined;
}

function push(connection: StreamConnection, value: ContinuityValue): void {
	connection.send("continuity", "changed", { value } satisfies ContinuityChangedEvent);
}
