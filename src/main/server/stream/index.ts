import type { Server } from "node:http";
import { type RawData, WebSocketServer } from "ws";
import { Logger } from "@main/logger";
import { authorizeUpgrade } from "@main/server/auth";
import { handleActivityMessage } from "@main/server/stream/activity";
import { StreamConnection } from "@main/server/stream/connection";
import { handleContinuityMessage } from "@main/server/stream/continuity";
import { streamEnvelopeSchema } from "@main/server/stream/messages";
import { handleReviewMessage } from "@main/server/stream/review";
import { detachTerminalConnection, handleTerminalMessage } from "@main/server/stream/terminal";
import type { StreamChannel, StreamEnvelope } from "@shared/stream";

const CHANNEL_HANDLERS: Record<
	StreamChannel,
	(connection: StreamConnection, message: StreamEnvelope) => unknown
> = {
	terminal: handleTerminalMessage,
	activity: handleActivityMessage,
	review: handleReviewMessage,
	continuity: handleContinuityMessage,
};

export function attachStreamServer(server: Server, token: string): void {
	const sockets = new WebSocketServer({ noServer: true });

	server.on("upgrade", (request, socket, head) => {
		if (!authorizeUpgrade(request.url, token)) {
			Logger.warn("stream:upgrade-rejected");
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();

			return;
		}

		sockets.handleUpgrade(request, socket, head, (accepted) => {
			const connection = new StreamConnection(accepted);

			accepted.on("message", (data) => {
				receive(connection, textOf(data));
			});
			accepted.on("close", () => {
				detachTerminalConnection(connection);
				connection.close();
			});
			accepted.on("error", (err) => Logger.error("stream:socket-error", { err: String(err) }));
		});
	});
}

function textOf(data: RawData): string {
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString("utf8");
	}

	if (Buffer.isBuffer(data)) {
		return data.toString("utf8");
	}

	return Buffer.from(data).toString("utf8");
}

function receive(connection: StreamConnection, data: string): void {
	let message: StreamEnvelope;

	try {
		message = streamEnvelopeSchema.assert(JSON.parse(data));
	} catch (err) {
		Logger.warn("stream:invalid-message", { err: String(err) });

		return;
	}

	dispatch(connection, message).catch((err) => {
		if (message.requestId) {
			connection.reject(message.channel, message.requestId, String(err));

			return;
		}

		Logger.warn("stream:handler-failed", { channel: message.channel, type: message.type, err: String(err) });
	});
}

async function dispatch(connection: StreamConnection, message: StreamEnvelope): Promise<void> {
	const value = await CHANNEL_HANDLERS[message.channel](connection, message);

	if (message.requestId) {
		connection.reply(message.channel, message.requestId, value);
	}
}
