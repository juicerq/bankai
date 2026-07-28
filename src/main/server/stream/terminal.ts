import { Logger } from "@main/logger";
import type { StreamConnection } from "@main/server/stream/connection";
import { TerminalSchemas } from "@main/server/stream/messages";
import type { ShellAttachment } from "@main/terminal/ShellProcesses";
import { shellProcesses } from "@main/terminal/ShellProcesses";
import { TerminalSessions } from "@main/terminal/TerminalSessions";
import type { StreamEnvelope } from "@shared/stream";
import type { TerminalCommandErrorEvent } from "@shared/terminal";

export async function handleTerminalMessage(
	connection: StreamConnection,
	message: StreamEnvelope,
): Promise<unknown> {
	switch (message.type) {
		case "open":
			return await TerminalSessions.open(
				attachmentOf(connection),
				TerminalSchemas.open.assert(message.payload),
			);
		case "resume":
			return await TerminalSessions.resume(
				attachmentOf(connection),
				TerminalSchemas.resume.assert(message.payload),
			);
		case "write": {
			const input = TerminalSchemas.write.assert(message.payload);

			return run(connection, "write", input.sessionId, () => {
				shellProcesses.write(input.sessionId, input.data);
			});
		}
		case "resize": {
			const input = TerminalSchemas.resize.assert(message.payload);

			return run(connection, "resize", input.sessionId, () => {
				shellProcesses.resize(input.sessionId, input.cols, input.rows);
			});
		}
		case "close": {
			const { sessionId } = TerminalSchemas.session.assert(message.payload);

			return run(connection, "close", sessionId, () =>
				shellProcesses.close(sessionId),
			);
		}
		case "detach": {
			const { sessionId } = TerminalSchemas.session.assert(message.payload);
			shellProcesses.detach(sessionId, connection.id);

			return undefined;
		}
		default:
			throw new Error(`Unknown terminal message "${message.type}"`);
	}
}

export function detachTerminalConnection(connection: StreamConnection): void {
	shellProcesses.detachConnection(connection.id);
}

function attachmentOf(connection: StreamConnection): ShellAttachment {
	return {
		connectionId: connection.id,
		send: (event) => connection.send("terminal", event.type, event.payload),
	};
}

function run(
	connection: StreamConnection,
	command: TerminalCommandErrorEvent["command"],
	sessionId: string,
	act: () => void,
): undefined {
	try {
		act();
	} catch (err) {
		const error = String(err);
		Logger.error(`terminal:${command}-failed`, {
			connectionId: connection.id,
			sessionId,
			err: error,
		});
		connection.send("terminal", "command-error", {
			sessionId,
			command,
			error,
		} satisfies TerminalCommandErrorEvent);
	}

	return undefined;
}
