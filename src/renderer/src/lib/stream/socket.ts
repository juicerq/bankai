import { probeUnpaired } from "@renderer/lib/pairing";
import { isBrowserClient } from "@renderer/lib/platform";
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
	private generation = 0;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		window.addEventListener("online", this.retry);
		document.addEventListener("visibilitychange", this.wake);
	}

	dispose(): void {
		window.removeEventListener("online", this.retry);
		document.removeEventListener("visibilitychange", this.wake);
		clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		this.generation += 1;
		const socket = this.socket;
		this.socket = undefined;
		this.connecting = false;
		this.outbox = [];
		this.rejectPending(new Error("The Bankai stream was disposed"));
		socket?.close();
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

	private readonly wake = (): void => {
		if (document.visibilityState === "visible") {
			this.retry();
		}
	};

	readonly retry = (): void => {
		if (this.halted) {
			return;
		}

		clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		this.attempt = 0;
		this.connect();
	};

	readonly unpair = (): void => {
		if (!isBrowserClient() || this.halted) {
			return;
		}

		this.halt("unpaired");
	};

	private get halted(): boolean {
		return this.status === "outdated" || this.status === "unpaired";
	}

	private emit(envelope: StreamEnvelope): void {
		if (this.halted) {
			this.rejectPending(haltError(this.status));

			return;
		}

		const data = JSON.stringify(envelope);
		this.connect();

		if (this.status === "open" && this.socket) {
			this.socket.send(data);

			return;
		}

		this.outbox.push(data);
	}

	private connect(): void {
		if (this.socket || this.connecting || this.retryTimer !== undefined || this.halted) {
			return;
		}

		this.connecting = true;
		const generation = this.generation;
		streamUrl()
			.then((url) => {
				if (generation !== this.generation) {
					return;
				}

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
			.catch((err) => {
				if (generation !== this.generation) {
					return;
				}

				this.drop(err instanceof Error ? err : new Error(String(err)));
			});
	}

	private handshake(version: string): void {
		if (this.serverVersion && this.serverVersion !== version) {
			this.halt("outdated");

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

	private halt(status: StreamStatus): void {
		clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		this.generation += 1;
		this.setStatus(status);
		const socket = this.socket;
		this.socket = undefined;
		this.connecting = false;
		this.outbox = [];
		this.rejectPending(haltError(status));
		socket?.close();
	}

	private drop(error: Error): void {
		this.generation += 1;
		this.socket = undefined;
		this.connecting = false;
		this.outbox = [];
		this.rejectPending(error);

		if (this.halted) {
			return;
		}

		this.setStatus("reconnecting");
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			this.connect();
		}, reconnectDelay(this.attempt));
		this.attempt += 1;

		if (isBrowserClient()) {
			this.checkPairing().catch((err) => console.error("Failed to check the Bankai pairing", err));
		}
	}

	private rejectPending(error: Error): void {
		const waiting = [...this.pending.values()];
		this.pending.clear();

		for (const request of waiting) {
			request.reject(error);
		}
	}

	private async checkPairing(): Promise<void> {
		if (await probeUnpaired(await reach())) {
			this.unpair();
		}
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
		const { requestId } = envelope;
		if (!requestId) {
			return;
		}

		const request = this.pending.get(requestId);
		if (!request) {
			return;
		}

		this.pending.delete(requestId);
		if (envelope.type === STREAM_REJECT) {
			request.reject(new Error(String(envelope.payload)));

			return;
		}

		request.resolve(envelope.payload);
	}
}

function haltError(status: StreamStatus): Error {
	return new Error(`The Bankai stream is ${status}`);
}

function helloVersion(payload: unknown): StreamHello["version"] {
	if (!payload || typeof payload !== "object" || !("version" in payload) || typeof payload.version !== "string") {
		throw new Error("The Bankai stream announced no version");
	}

	return payload.version;
}

async function streamUrl(): Promise<string> {
	const { origin, token } = await reach();
	const url = new URL(SERVER_STREAM_PATH, origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

	if (token) {
		url.searchParams.set(SERVER_STREAM_TOKEN_PARAM, token);
	}

	return url.toString();
}

export const streamSocket = new StreamSocket();
