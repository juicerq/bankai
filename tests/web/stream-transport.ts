import "./register-dom";
import { SERVER_DEFAULT_PORT } from "@shared/server";
import { STREAM_HELLO, STREAM_REJECT, STREAM_REPLY, type StreamChannel, type StreamEnvelope } from "@shared/stream";

const STREAM_TEST_VERSION = "0.0.0-test";

type StreamListener = (event: { data?: string }) => void;

interface TransportHandler {
	run(payload: unknown): unknown;
}

class FakeWebSocket {
	static readonly OPEN = 1;
	static readonly CLOSED = 3;

	readyState = 0;
	private readonly listeners = new Map<string, Set<StreamListener>>();

	constructor(readonly url: string) {
		streamTransport.hold(this);
		queueMicrotask(() => {
			this.readyState = FakeWebSocket.OPEN;
			this.dispatch("open", {});
			this.deliver({ channel: "system", type: STREAM_HELLO, payload: { version: streamTransport.version } });
		});
	}

	addEventListener(type: string, listener: StreamListener) {
		const listeners = this.listeners.get(type) ?? new Set();
		this.listeners.set(type, listeners);
		listeners.add(listener);
	}

	send(data: string) {
		const envelope: StreamEnvelope = JSON.parse(data);
		streamTransport.receive(envelope);
	}

	close() {
		this.readyState = FakeWebSocket.CLOSED;
		this.dispatch("close", {});
	}

	deliver(envelope: StreamEnvelope) {
		this.dispatch("message", { data: JSON.stringify(envelope) });
	}

	private dispatch(type: string, event: { data?: string }) {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
	}
}

class StreamTransport {
	readonly calls: StreamEnvelope[] = [];
	version = STREAM_TEST_VERSION;
	connections = 0;
	private readonly handlers = new Map<string, TransportHandler>();
	private socket: FakeWebSocket | undefined;

	handle<Payload>(channel: StreamChannel, type: string, handler: (payload: Payload) => unknown) {
		this.handlers.set(`${channel} ${type}`, { run: handler });
	}

	payloads(channel: StreamChannel, type: string): unknown[] {
		return this.calls
			.filter((call) => call.channel === channel && call.type === type)
			.map((call) => call.payload);
	}

	reset() {
		this.calls.length = 0;
		this.connections = 0;
		this.version = STREAM_TEST_VERSION;
	}

	push(channel: StreamChannel, type: string, payload?: unknown) {
		this.socket?.deliver({ channel, type, payload });
	}

	disconnect() {
		this.socket?.close();
	}

	hold(socket: FakeWebSocket) {
		this.socket = socket;
		this.connections += 1;
	}

	receive(envelope: StreamEnvelope) {
		this.calls.push(envelope);

		const handler = this.handlers.get(`${envelope.channel} ${envelope.type}`);
		const { requestId } = envelope;
		if (!requestId) {
			return;
		}

		if (!handler) {
			this.socket?.deliver({
				channel: envelope.channel,
				type: STREAM_REJECT,
				requestId,
				payload: `No handler for ${envelope.channel} ${envelope.type}`,
			});

			return;
		}

		Promise.resolve(handler.run(envelope.payload))
			.then((value) => {
				this.socket?.deliver({ channel: envelope.channel, type: STREAM_REPLY, requestId, payload: value });
			})
			.catch((err) => {
				this.socket?.deliver({
					channel: envelope.channel,
					type: STREAM_REJECT,
					requestId,
					payload: String(err instanceof Error ? err.message : err),
				});
			});
	}
}

export const streamTransport = new StreamTransport();

window.bankaiAuth ??= {
	getToken: () => Promise.resolve({ port: SERVER_DEFAULT_PORT, token: "stream-token" }),
};

Object.defineProperty(globalThis, "WebSocket", { value: FakeWebSocket });
