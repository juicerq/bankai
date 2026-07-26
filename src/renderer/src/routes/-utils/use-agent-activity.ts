import { useMemo, useSyncExternalStore } from "react";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

export interface AgentActivities {
	shells: ReadonlyMap<string, AgentActivityState>;
	worktrees: ReadonlyMap<string, string>;
	lastLines: ReadonlyMap<string, string>;
}

const EMPTY_ACTIVITIES: AgentActivities = {
	shells: new Map(),
	worktrees: new Map(),
	lastLines: new Map(),
};

export function useAgentActivities(projectIds: string[]): AgentActivities {
	const key = [...projectIds].sort().join(" ");
	const observer = useMemo(
		() => new AgentActivityObserver(key ? key.split(" ") : []),
		[key],
	);

	return useSyncExternalStore(observer.subscribe, observer.getSnapshot);
}

class AgentActivityObserver {
	private snapshot: AgentActivities = EMPTY_ACTIVITIES;
	private notify: (() => void) | undefined;
	private readonly shellKeys = new Map<string, string[]>();
	private readonly worktreeKeys = new Map<string, string[]>();
	private readonly lastLineKeys = new Map<string, string[]>();

	constructor(private readonly projectIds: string[]) {}

	readonly getSnapshot = () => this.snapshot;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;
		const stopListening = window.bankaiActivity.onChanged((event) => {
			if (this.projectIds.includes(event.projectId)) {
				this.set(event.projectId, event);
			}
		});

		for (const projectId of this.projectIds) {
			window.bankaiActivity.watch(projectId)
				.then((snapshot) => this.set(projectId, snapshot))
				.catch((err) => console.error("Failed to watch agent activity", err));
		}

		return () => {
			stopListening();
			this.notify = undefined;
			this.shellKeys.clear();
			this.worktreeKeys.clear();
			this.lastLineKeys.clear();
			for (const projectId of this.projectIds) {
				window.bankaiActivity.unwatch(projectId);
			}
		};
	};

	private set(projectId: string, snapshot: ProjectActivitySnapshot) {
		const shellStates = new Map(this.snapshot.shells);
		for (const sessionId of this.shellKeys.get(projectId) ?? []) {
			shellStates.delete(sessionId);
		}
		for (const [sessionId, shellState] of Object.entries(snapshot.shells)) {
			shellStates.set(sessionId, shellState);
		}
		this.shellKeys.set(projectId, Object.keys(snapshot.shells));

		const worktrees = new Map(this.snapshot.worktrees);
		for (const shellId of this.worktreeKeys.get(projectId) ?? []) {
			worktrees.delete(shellId);
		}
		for (const [shellId, worktree] of Object.entries(snapshot.worktreeByShellId)) {
			worktrees.set(shellId, worktree);
		}
		this.worktreeKeys.set(projectId, Object.keys(snapshot.worktreeByShellId));

		const lastLines = new Map(this.snapshot.lastLines);
		for (const shellId of this.lastLineKeys.get(projectId) ?? []) {
			lastLines.delete(shellId);
		}
		for (const [shellId, line] of Object.entries(snapshot.lastLineByShellId)) {
			lastLines.set(shellId, line);
		}
		this.lastLineKeys.set(projectId, Object.keys(snapshot.lastLineByShellId));

		this.snapshot = { shells: shellStates, worktrees, lastLines };
		this.notify?.();
	}
}
