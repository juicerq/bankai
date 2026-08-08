import { useMemo, useSyncExternalStore } from "react";
import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

export interface AgentActivities {
	shells: ReadonlyMap<string, AgentActivityState>;
	worktrees: ReadonlyMap<string, string>;
	statusSince: ReadonlyMap<string, number>;
	harnesses: ReadonlyMap<string, string>;
}

const EMPTY_ACTIVITIES: AgentActivities = {
	shells: new Map(),
	worktrees: new Map(),
	statusSince: new Map(),
	harnesses: new Map(),
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
	private generation = 0;
	private readonly shells = new MergedByProject<AgentActivityState>();
	private readonly worktrees = new MergedByProject<string>();
	private readonly statusSince = new MergedByProject<number>();
	private readonly harnesses = new MergedByProject<string>();

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
			this.generation += 1;
			this.notify = undefined;
			for (const projectId of this.projectIds) {
				activityStream.unwatch(projectId);
			}
		};
	};

	private async watchProjects() {
		const generation = ++this.generation;

		await Promise.all(this.projectIds.map(async (projectId) => {
			const snapshot = await activityStream.watch(projectId);

			if (generation !== this.generation) {
				return;
			}

			this.set(projectId, snapshot);
		}));
	}

	private set(projectId: string, snapshot: ProjectActivitySnapshot) {
		this.snapshot = {
			shells: this.shells.merge(projectId, this.snapshot.shells, snapshot.shells),
			worktrees: this.worktrees.merge(projectId, this.snapshot.worktrees, snapshot.worktreeByShellId),
			statusSince: this.statusSince.merge(projectId, this.snapshot.statusSince, snapshot.statusSinceByShellId),
			harnesses: this.harnesses.merge(projectId, this.snapshot.harnesses, snapshot.harnessByShellId),
		};
		this.notify?.();
	}
}
