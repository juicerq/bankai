import type { StreamConnection } from "@main/transport/stream/stream-connection";
import type { StreamChannel } from "@shared/stream";

interface ConnectionWatch {
	references: number;
	stop: (() => void) | undefined;
}

interface WatchAddress {
	connection: StreamConnection;
	channel: StreamChannel;
	key: string;
}

const watchesByConnection = new Map<string, Map<string, ConnectionWatch>>();

async function retainWatch(
	address: WatchAddress,
	start: () => Promise<() => void> | (() => void),
): Promise<void> {
	const watches = watchesOf(address.connection);
	const key = watchKey(address);
	const watched = watches.get(key);

	if (watched) {
		watched.references += 1;

		return;
	}

	const watch: ConnectionWatch = { references: 1, stop: undefined };
	watches.set(key, watch);

	try {
		const stop = await start();

		if (watchesByConnection.get(address.connection.id)?.get(key) !== watch) {
			stop();

			return;
		}

		watch.stop = stop;
	} catch (err) {
		if (watches.get(key) === watch) {
			watches.delete(key);
		}

		throw err;
	}
}

function replaceWatch(address: WatchAddress, stop: () => void): void {
	const watches = watchesOf(address.connection);
	const key = watchKey(address);

	watches.get(key)?.stop?.();

	if (watchesByConnection.get(address.connection.id) !== watches) {
		stop();

		return;
	}

	watches.set(key, { references: 1, stop });
}

function releaseWatch(address: WatchAddress): void {
	const watches = watchesByConnection.get(address.connection.id);
	const key = watchKey(address);
	const watched = watches?.get(key);

	if (!watches || !watched) {
		return;
	}

	watched.references -= 1;

	if (watched.references === 0) {
		watched.stop?.();
		watches.delete(key);
	}
}

function watchKey(address: WatchAddress): string {
	return `${address.channel} ${address.key}`;
}

function watchesOf(connection: StreamConnection): Map<string, ConnectionWatch> {
	const existing = watchesByConnection.get(connection.id);
	if (existing) {
		return existing;
	}

	const watches = new Map<string, ConnectionWatch>();
	watchesByConnection.set(connection.id, watches);
	connection.onClose(() => {
		watchesByConnection.delete(connection.id);
		for (const watched of watches.values()) {
			watched.stop?.();
		}
		watches.clear();
	});

	return watches;
}

export const ConnectionWatches = {
	retain: retainWatch,
	replace: replaceWatch,
	release: releaseWatch,
};
