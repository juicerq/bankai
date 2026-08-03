import type { WebSocketServer } from "ws";

const STREAM_HEARTBEAT_MS = 30_000;

export interface HeartbeatSocket {
	ping: () => void;
	terminate: () => void;
	once: (event: "pong", listener: () => void) => void;
}

function sweepSockets(sockets: Iterable<HeartbeatSocket>, pending: WeakSet<HeartbeatSocket>): void {
	for (const socket of sockets) {
		if (pending.delete(socket)) {
			socket.terminate();

			continue;
		}

		pending.add(socket);
		socket.once("pong", () => pending.delete(socket));
		socket.ping();
	}
}

function watchLiveness(server: WebSocketServer): void {
	const pending = new WeakSet<HeartbeatSocket>();
	const beat = setInterval(() => sweepSockets(server.clients, pending), STREAM_HEARTBEAT_MS);

	beat.unref();
	server.on("close", () => clearInterval(beat));
}

export const StreamHeartbeat = {
	sweep: sweepSockets,
	watch: watchLiveness,
};
