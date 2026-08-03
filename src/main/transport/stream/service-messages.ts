import type { StreamConnection } from "@main/transport/stream/stream-connection";
import { replaceWatch } from "@main/transport/stream/connection-watches";
import { Services } from "@main/services";
import type { ServicesChangedEvent, ServiceState } from "@shared/services";
import type { StreamEnvelope } from "@shared/stream";

export function handleServicesMessage(connection: StreamConnection, message: StreamEnvelope): unknown {
	if (message.type !== "subscribe") {
		throw new Error(`Unknown services message "${message.type}"`);
	}

	replaceWatch(
		{ connection, channel: "services", key: "" },
		Services.subscribe((states) => push(connection, states)),
	);

	const states = Services.list();
	push(connection, states);

	return states;
}

function push(connection: StreamConnection, states: ServiceState[]): void {
	connection.send("services", "changed", { states } satisfies ServicesChangedEvent);
}
