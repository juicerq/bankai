import { reach } from "@renderer/lib/reach";
import { streamResync } from "@renderer/lib/stream/resync";
import { type StreamStatus, streamStatus } from "@renderer/lib/stream/status";
import { SERVER_STREAM_PATH, SERVER_STREAM_TOKEN_PARAM } from "@shared/server";
import {
	STREAM_HELLO,
	STREAM_REJECT,
	STREAM_REPLY,
	type StreamChannel,
	type StreamEnvelope,
	type StreamHello,
} from "@shared/stream";

const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 5000];
const RECONNECT_DELAY_MAX_MS = 10_000;

export function reconnectDelay(attempt: number): number {
	return RECONNECT_DELAYS_MS[attempt] ?? RECONNECT_DELAY_MAX_MS;
}

interface PendingRequest {
	resolve(value: unknown): void;
	reject(error: Error): void;
}

interface StreamListener {
	deliver(payload: unknown): void;
}

export class StreamSocket {
	private socket: WebSocket | undefined;
	private connecting = false;
	private outbox: string[] = [];
	private readonly listeners = new Map<string, Set<StreamListener>>();
	private readonly pending = new Map<string, PendingRequest>();
	private nextRequestId = 0;
	private status: StreamStatus = "connecting";
	private serverVersion: string | undefined;
	private attempt = 0;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		window.addEventListener("online", this.retry);
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") {
				this.retry();
			}
		});
	}

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

	readonly retry = (): void => {
		if (this.status === "outdated") {
			return;
		}

		clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		this.attempt = 0;
		this.connect();
	};

	private emit(envelope: StreamEnvelope): void {
		const data = JSON.stringify(envelope);
		this.connect();

		if (this.status === "open" && this.socket) {
			this.socket.send(data);

			return;
		}

		this.outbox.push(data);
	}

	private connect(): void {
		if (this.socket || this.connecting || this.retryTimer !== undefined || this.status === "outdated") {
			return;
		}

		this.connecting = true;
		streamUrl()
			.then((url) => {
				const socket = new WebSocket(url);
				this.socket = socket;
				socket.addEventListener("message", (event) => this.receive(String(event.data)));
				socket.addEventListener("close", () => {
					if (this.socket === socket) {
						this.drop(new Error("Bankai stream disconnected"));
					}
				});
				socket.addEventListener("error", () => socket.close());
			})
			.catch((err) => this.drop(err instanceof Error ? err : new Error(String(err))));
	}

	private handshake(version: string): void {
		if (this.serverVersion && this.serverVersion !== version) {
			this.outdate();

			return;
		}

		const reconnected = !!this.serverVersion;
		this.serverVersion = version;
		this.connecting = false;
		this.attempt = 0;
		this.setStatus("open");

		const queued = this.outbox;
		this.outbox = [];
		for (const data of queued) {
			this.socket?.send(data);
		}

		if (reconnected) {
			streamResync.run().catch((err) => console.error("Failed to resync the Bankai stream", err));
		}
	}

	private outdate(): void {
		this.setStatus("outdated");
		const socket = this.socket;
		this.socket = undefined;
		this.connecting = false;
		this.outbox = [];
		socket?.close();
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

		if (this.status === "outdated") {
			return;
		}

		this.setStatus("reconnecting");
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			this.connect();
		}, reconnectDelay(this.attempt));
		this.attempt += 1;
	}

	private setStatus(status: StreamStatus): void {
		this.status = status;
		streamStatus.set(status);
	}

	private receive(data: string): void {
		const envelope: StreamEnvelope = JSON.parse(data);

		if (envelope.channel === "system" && envelope.type === STREAM_HELLO) {
			this.handshake(helloVersion(envelope.payload));

			return;
		}

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

function helloVersion(payload: unknown): StreamHello["version"] {
	if (!payload || typeof payload !== "object" || !("version" in payload) || typeof payload.version !== "string") {
		throw new Error("The Bankai stream announced no version");
	}

	return payload.version;
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
