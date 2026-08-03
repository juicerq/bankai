import type { Server } from "node:http";
import { app } from "electron";
import { type RawData, WebSocketServer } from "ws";
import { Logger } from "@main/infra/logger";
import { ServerAuth } from "@main/transport/server/server-auth";
import { LiveConnections } from "@main/transport/server/live-connections";
import { Reach } from "@main/transport/server/server-reach";
import { ActivityMessages } from "@main/transport/stream/activity-messages";
import { StreamConnection } from "@main/transport/stream/stream-connection";
import { ContinuityMessages } from "@main/transport/stream/continuity-messages";
import { ConversationMessages } from "@main/transport/stream/conversation-messages";
import { StreamHeartbeat } from "@main/transport/stream/stream-heartbeat";
import { STREAM_MAX_PAYLOAD_BYTES, streamEnvelopeSchema } from "@main/transport/stream/stream-messages";
import { ReviewMessages } from "@main/transport/stream/review-messages";
import { ServiceMessages } from "@main/transport/stream/service-messages";
import { TerminalMessages } from "@main/transport/stream/terminal-messages";
import { STREAM_HELLO, type StreamChannel, type StreamEnvelope, type StreamHello } from "@shared/stream";

const CHANNEL_HANDLERS: Record<
	StreamChannel,
	(connection: StreamConnection, message: StreamEnvelope) => unknown
> = {
	terminal: TerminalMessages.handle,
	activity: ActivityMessages.handle,
	review: ReviewMessages.handle,
	continuity: ContinuityMessages.handle,
	conversation: ConversationMessages.handle,
	services: ServiceMessages.handle,
	system: () => {
		throw new Error("The system channel only carries server announcements");
	},
};

function attachStreamServer(server: Server): void {
	const sockets = new WebSocketServer({ noServer: true, maxPayload: STREAM_MAX_PAYLOAD_BYTES });

	StreamHeartbeat.watch(sockets);
	server.on("close", () => sockets.close());
	server.on("upgrade", (request, socket, head) => {
		if (!ServerAuth.upgrade(request.url, Reach.current().token)) {
			Logger.warn("stream:upgrade-rejected");
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();

			return;
		}

		sockets.handleUpgrade(request, socket, head, (accepted) => {
			const connection = new StreamConnection(accepted);

			LiveConnections.track(accepted);
			connection.send("system", STREAM_HELLO, { version: app.getVersion() } satisfies StreamHello);
			accepted.on("message", (data) => {
				receive(connection, textOf(data));
			});
			accepted.on("close", () => connection.close());
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

export const StreamServer = {
	attach: attachStreamServer,
};
