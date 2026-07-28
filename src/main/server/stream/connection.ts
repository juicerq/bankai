import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { Logger } from "@main/logger";
import { STREAM_REJECT, STREAM_REPLY, type StreamChannel, type StreamEnvelope } from "@shared/stream";

export class StreamConnection {
	readonly id = randomUUID();
	private readonly cleanups = new Set<() => void>();
	private closed = false;

	constructor(private readonly socket: WebSocket) {}

	send(channel: StreamChannel, type: string, payload?: unknown): void {
		this.emit({ channel, type, payload });
	}

	reply(channel: StreamChannel, requestId: string, payload: unknown): void {
		this.emit({ channel, type: STREAM_REPLY, requestId, payload });
	}

	reject(channel: StreamChannel, requestId: string, error: string): void {
		this.emit({ channel, type: STREAM_REJECT, requestId, payload: error });
	}

	onClose(cleanup: () => void): void {
		if (this.closed) {
			cleanup();

			return;
		}

		this.cleanups.add(cleanup);
	}

	close(): void {
		this.closed = true;
		for (const cleanup of this.cleanups) {
			cleanup();
		}

		this.cleanups.clear();
	}

	private emit(envelope: StreamEnvelope): void {
		if (this.socket.readyState !== WebSocket.OPEN) {
			return;
		}

		try {
			this.socket.send(JSON.stringify(envelope));
		} catch (err) {
			Logger.error("stream:send-failed", {
				channel: envelope.channel,
				type: envelope.type,
				err: String(err),
			});
		}
	}
}
