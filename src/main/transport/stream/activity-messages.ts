import { AgentActivity } from "@main/agents/agent-activity";
import { ShellFocus } from "@main/terminal/shell-focus";
import type { StreamConnection } from "@main/transport/stream/stream-connection";
import { ConnectionWatches } from "@main/transport/stream/connection-watches";
import { ActivitySchemas } from "@main/transport/stream/stream-messages";
import type { ActivityChangedEvent } from "@shared/activity";
import type { StreamEnvelope } from "@shared/stream";

async function handleActivityMessage(connection: StreamConnection, message: StreamEnvelope): Promise<unknown> {
	switch (message.type) {
		case "watch": {
			const { projectId } = ActivitySchemas.project.assert(message.payload);

			await ConnectionWatches.retain({ connection, channel: "activity", key: projectId }, () =>
				AgentActivity.subscribe(projectId, (snapshot) => {
					connection.send("activity", "changed", { projectId, ...snapshot } satisfies ActivityChangedEvent);
				}),
			);

			return AgentActivity.getProjectSnapshot(projectId);
		}
		case "unwatch": {
			const { projectId } = ActivitySchemas.project.assert(message.payload);
			ConnectionWatches.release({ connection, channel: "activity", key: projectId });

			return undefined;
		}
		case "focus-shell": {
			const { shellId } = ActivitySchemas.focusShell.assert(message.payload);

			ShellFocus.focus(connection, shellId);

			return undefined;
		}
		default:
			throw new Error(`Unknown activity message "${message.type}"`);
	}
}

export const ActivityMessages = {
	handle: handleActivityMessage,
};
