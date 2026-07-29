import { AgentActivity } from "@main/activity/AgentActivity";
import { focusShell } from "@main/activity/ShellFocus";
import type { StreamConnection } from "@main/server/stream/connection";
import { releaseWatch, retainWatch } from "@main/server/stream/connectionWatches";
import { ActivitySchemas } from "@main/server/stream/messages";
import type { ActivityChangedEvent } from "@shared/activity";
import type { StreamEnvelope } from "@shared/stream";

export async function handleActivityMessage(connection: StreamConnection, message: StreamEnvelope): Promise<unknown> {
	switch (message.type) {
		case "watch": {
			const { projectId } = ActivitySchemas.project.assert(message.payload);

			await retainWatch({ connection, channel: "activity", key: projectId }, () =>
				AgentActivity.subscribe(projectId, (snapshot) => {
					connection.send("activity", "changed", { projectId, ...snapshot } satisfies ActivityChangedEvent);
				}),
			);

			return AgentActivity.getProjectSnapshot(projectId);
		}
		case "unwatch": {
			const { projectId } = ActivitySchemas.project.assert(message.payload);
			releaseWatch({ connection, channel: "activity", key: projectId });

			return undefined;
		}
		case "focus-shell": {
			const { shellId } = ActivitySchemas.focusShell.assert(message.payload);

			focusShell(connection, shellId);

			return undefined;
		}
		default:
			throw new Error(`Unknown activity message "${message.type}"`);
	}
}
