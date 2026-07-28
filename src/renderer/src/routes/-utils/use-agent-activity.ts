import { useMemo, useSyncExternalStore } from "react";
import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

export interface AgentActivities {
	shells: ReadonlyMap<string, AgentActivityState>;
	worktrees: ReadonlyMap<string, string>;
	traces: ReadonlyMap<string, string>;
	traceSince: ReadonlyMap<string, number>;
	statusSince: ReadonlyMap<string, number>;
}

const EMPTY_ACTIVITIES: AgentActivities = {
	shells: new Map(),
	worktrees: new Map(),
	traces: new Map(),
	traceSince: new Map(),
	statusSince: new Map(),
};

export function useAgentActivities(projectIds: string[]): AgentActivities {
	const key = [...projectIds].sort().join(" ");
	const observer = useMemo(
		() => new AgentActivityObserver(key ? key.split(" ") : []),
		[key],
	);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class MergedByProject<T> {
	private readonly owned = new Map<string, string[]>();

	merge(projectId: string, previous: ReadonlyMap<string, T>, incoming: Record<string, T>): Map<string, T> {
		const merged = new Map(previous);
		for (const key of this.owned.get(projectId) ?? []) {
			merged.delete(key);
		}
		for (const [key, value] of Object.entries(incoming)) {
			merged.set(key, value);
		}
		this.owned.set(projectId, Object.keys(incoming));

		return merged;
	}
}

class AgentActivityObserver {
	private snapshot: AgentActivities = EMPTY_ACTIVITIES;
	private notify: (() => void) | undefined;
	private readonly shells = new MergedByProject<AgentActivityState>();
	private readonly worktrees = new MergedByProject<string>();
	private readonly traces = new MergedByProject<string>();
	private readonly traceSince = new MergedByProject<number>();
	private readonly statusSince = new MergedByProject<number>();

	constructor(private readonly projectIds: string[]) {}

	readonly getSnapshot = () => this.snapshot;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;
		const stopListening = activityStream.onChanged((event) => {
			if (this.projectIds.includes(event.projectId)) {
				this.set(event.projectId, event);
			}
		});
		const stopResync = streamResync.register("watch", () => this.watchProjects());

		this.watchProjects().catch((err) => console.error("Failed to watch agent activity", err));

		return () => {
			stopListening();
			stopResync();
			this.notify = undefined;
			for (const projectId of this.projectIds) {
				activityStream.unwatch(projectId);
			}
		};
	};

	private async watchProjects() {
		await Promise.all(this.projectIds.map(async (projectId) => {
			this.set(projectId, await activityStream.watch(projectId));
		}));
	}

	private set(projectId: string, snapshot: ProjectActivitySnapshot) {
		this.snapshot = {
			shells: this.shells.merge(projectId, this.snapshot.shells, snapshot.shells),
			worktrees: this.worktrees.merge(projectId, this.snapshot.worktrees, snapshot.worktreeByShellId),
			traces: this.traces.merge(projectId, this.snapshot.traces, snapshot.traceByShellId),
			traceSince: this.traceSince.merge(projectId, this.snapshot.traceSince, snapshot.traceSinceByShellId),
			statusSince: this.statusSince.merge(projectId, this.snapshot.statusSince, snapshot.statusSinceByShellId),
		};
		this.notify?.();
	}
}
