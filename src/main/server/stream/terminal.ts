import { AgentActivity } from "@main/activity/AgentActivity";
import { Logger } from "@main/logger";
import type { StreamConnection } from "@main/server/stream/connection";
import { TerminalSchemas } from "@main/server/stream/messages";
import { bracketedPaste, TERMINAL_KEY_BYTES } from "@main/terminal/input";
import type { ShellAttachment } from "@main/terminal/ShellProcesses";
import { shellProcesses } from "@main/terminal/ShellProcesses";
import { TerminalSessions } from "@main/terminal/TerminalSessions";
import type { StreamEnvelope } from "@shared/stream";
import type { TerminalAttached, TerminalCommandErrorEvent } from "@shared/terminal";

export async function handleTerminalMessage(
	connection: StreamConnection,
	message: StreamEnvelope,
): Promise<unknown> {
	switch (message.type) {
		case "open":
			return detachOnClose(
				connection,
				await TerminalSessions.open(attachmentOf(connection), TerminalSchemas.open.assert(message.payload)),
			);
		case "resume":
			return detachOnClose(
				connection,
				await TerminalSessions.resume(attachmentOf(connection), TerminalSchemas.resume.assert(message.payload)),
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
		case "prompt": {
			const input = TerminalSchemas.prompt.assert(message.payload);
			const sessionId = liveSession(input);

			if (!AgentActivity.liveAgentSessions().has(sessionId)) {
				throw new Error("No agent is listening to this shell");
			}

			shellProcesses.write(sessionId, bracketedPaste(input.text));
			shellProcesses.write(sessionId, "\r");

			return undefined;
		}
		case "key": {
			const input = TerminalSchemas.key.assert(message.payload);
			shellProcesses.write(liveSession(input), TERMINAL_KEY_BYTES[input.key]);

			return undefined;
		}
		default:
			throw new Error(`Unknown terminal message "${message.type}"`);
	}
}

export function detachOnClose(connection: StreamConnection, attached: TerminalAttached): TerminalAttached {
	connection.onClose(() => shellProcesses.detach(attached.sessionId, connection.id));

	return attached;
}

function liveSession(address: { projectId: string; shellId: string }): string {
	const sessionId = shellProcesses.find(address);
	if (!sessionId) {
		throw new Error("This session is no longer running");
	}

	return sessionId;
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
