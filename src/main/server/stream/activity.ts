import { AgentActivity } from "@main/activity/AgentActivity";
import { focusShell } from "@main/activity/ShellFocus";
import type { StreamConnection } from "@main/server/stream/connection";
import { ActivitySchemas } from "@main/server/stream/messages";
import type { ActivityChangedEvent } from "@shared/activity";
import type { StreamEnvelope } from "@shared/stream";

interface WatchedProject {
	references: number;
	stop: () => void;
}

const watchesByConnection = new Map<string, Map<string, WatchedProject>>();

export function handleActivityMessage(connection: StreamConnection, message: StreamEnvelope): unknown {
	switch (message.type) {
		case "watch": {
			const { projectId } = ActivitySchemas.project.assert(message.payload);
			const watches = watchesOf(connection);
			const watched = watches.get(projectId);

			if (watched) {
				watched.references += 1;
			} else {
				const stop = AgentActivity.subscribe(projectId, (snapshot) => {
					connection.send("activity", "changed", { projectId, ...snapshot } satisfies ActivityChangedEvent);
				});
				watches.set(projectId, { references: 1, stop });
			}

			return AgentActivity.getProjectSnapshot(projectId);
		}
		case "unwatch": {
			const { projectId } = ActivitySchemas.project.assert(message.payload);
			const watches = watchesByConnection.get(connection.id);
			const watched = watches?.get(projectId);

			if (!watches || !watched) {
				return undefined;
			}

			watched.references -= 1;
			if (watched.references === 0) {
				watched.stop();
				watches.delete(projectId);
			}

			return undefined;
		}
		case "viewed":
			AgentActivity.markViewed(ActivitySchemas.viewed.assert(message.payload).sessionId);

			return undefined;
		case "focus-shell": {
			const { shellId } = ActivitySchemas.focusShell.assert(message.payload);

			focusShell(connection, shellId);

			if (shellId) {
				AgentActivity.markShellViewed(shellId);
			}

			return undefined;
		}
		default:
			throw new Error(`Unknown activity message "${message.type}"`);
	}
}

function watchesOf(connection: StreamConnection): Map<string, WatchedProject> {
	const existing = watchesByConnection.get(connection.id);
	if (existing) {
		return existing;
	}

	const watches = new Map<string, WatchedProject>();
	watchesByConnection.set(connection.id, watches);
	connection.onClose(() => {
		watchesByConnection.delete(connection.id);
		for (const watched of watches.values()) {
			watched.stop();
		}
		watches.clear();
	});

	return watches;
}
