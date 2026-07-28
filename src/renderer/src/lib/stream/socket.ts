import { reach } from "@renderer/lib/reach";
import { SERVER_STREAM_PATH, SERVER_STREAM_TOKEN_PARAM } from "@shared/server";
import { STREAM_REJECT, STREAM_REPLY, type StreamChannel, type StreamEnvelope } from "@shared/stream";

interface PendingRequest {
	resolve(value: unknown): void;
	reject(error: Error): void;
}

interface StreamListener {
	deliver(payload: unknown): void;
}

class StreamSocket {
	private socket: WebSocket | undefined;
	private connecting = false;
	private outbox: string[] = [];
	private readonly listeners = new Map<string, Set<StreamListener>>();
	private readonly pending = new Map<string, PendingRequest>();
	private nextRequestId = 0;

	send(channel: StreamChannel, type: string, payload?: unknown): void {
		this.emit({ channel, type, payload });
	}

	async request<Value>(channel: StreamChannel, type: string, payload?: unknown): Promise<Value> {
		this.nextRequestId += 1;
		const requestId = String(this.nextRequestId);

		return await new Promise<Value>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			this.emit({ channel, type, payload, requestId });
		});
	}

	on<Payload>(channel: StreamChannel, type: string, listener: (payload: Payload) => void): () => void {
		const key = `${channel} ${type}`;
		const listeners = this.listeners.get(key) ?? new Set<StreamListener>();
		this.listeners.set(key, listeners);

		const entry: StreamListener = { deliver: listener };
		listeners.add(entry);
		this.connect();

		return () => {
			listeners.delete(entry);
		};
	}

	private emit(envelope: StreamEnvelope): void {
		const data = JSON.stringify(envelope);
		this.connect();

		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(data);

			return;
		}

		this.outbox.push(data);
	}

	private connect(): void {
		if (this.socket || this.connecting) {
			return;
		}

		this.connecting = true;
		streamUrl()
			.then((url) => {
				const socket = new WebSocket(url);
				this.socket = socket;
				socket.addEventListener("open", () => {
					this.connecting = false;
					const queued = this.outbox;
					this.outbox = [];
					for (const data of queued) {
						socket.send(data);
					}
				});
				socket.addEventListener("message", (event) => this.receive(String(event.data)));
				socket.addEventListener("close", () => this.drop(new Error("Bankai stream disconnected")));
				socket.addEventListener("error", () => socket.close());
			})
			.catch((err) => this.drop(err instanceof Error ? err : new Error(String(err))));
	}

	private drop(error: Error): void {
		this.socket = undefined;
		this.connecting = false;
		this.outbox = [];

		const waiting = [...this.pending.values()];
		this.pending.clear();
		for (const request of waiting) {
			request.reject(error);
		}
	}

	private receive(data: string): void {
		const envelope: StreamEnvelope = JSON.parse(data);

		if (envelope.type === STREAM_REPLY || envelope.type === STREAM_REJECT) {
			this.settle(envelope);

			return;
		}

		for (const listener of this.listeners.get(`${envelope.channel} ${envelope.type}`) ?? []) {
			listener.deliver(envelope.payload);
		}
	}

	private settle(envelope: StreamEnvelope): void {
		const request = envelope.requestId ? this.pending.get(envelope.requestId) : undefined;
		if (!request || !envelope.requestId) {
			return;
		}

		this.pending.delete(envelope.requestId);
		if (envelope.type === STREAM_REJECT) {
			request.reject(new Error(String(envelope.payload)));

			return;
		}

		request.resolve(envelope.payload);
	}
}

async function streamUrl(): Promise<string> {
	const { origin, token } = await reach;
	const url = new URL(SERVER_STREAM_PATH, origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

	if (token) {
		url.searchParams.set(SERVER_STREAM_TOKEN_PARAM, token);
	}

	return url.toString();
}

export const streamSocket = new StreamSocket();
