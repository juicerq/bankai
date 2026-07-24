import { useMemo, useSyncExternalStore } from "react";
import type { AgentActivityState } from "@shared/activity";

export interface AgentActivities {
	projects: ReadonlyMap<string, AgentActivityState>;
	shells: ReadonlyMap<string, AgentActivityState>;
}

const EMPTY_ACTIVITIES: AgentActivities = { projects: new Map(), shells: new Map() };

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

	constructor(private readonly projectIds: string[]) {}

	readonly getSnapshot = () => this.snapshot;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;
		const stopListening = window.bankaiActivity.onChanged((event) => {
			if (this.projectIds.includes(event.projectId)) {
				this.set(event.projectId, event.state, event.shells);
			}
		});

		for (const projectId of this.projectIds) {
			window.bankaiActivity.watch(projectId)
				.then((snapshot) => this.set(projectId, snapshot.state, snapshot.shells))
				.catch((err) => console.error("Failed to watch agent activity", err));
		}

		return () => {
			stopListening();
			this.notify = undefined;
			this.shellKeys.clear();
			for (const projectId of this.projectIds) {
				window.bankaiActivity.unwatch(projectId);
			}
		};
	};

	private set(projectId: string, state: AgentActivityState | null, shells: Record<string, AgentActivityState>) {
		const projects = new Map(this.snapshot.projects);
		if (state === null) {
			projects.delete(projectId);
		} else {
			projects.set(projectId, state);
		}

		const shellStates = new Map(this.snapshot.shells);
		for (const sessionId of this.shellKeys.get(projectId) ?? []) {
			shellStates.delete(sessionId);
		}
		for (const [sessionId, shellState] of Object.entries(shells)) {
			shellStates.set(sessionId, shellState);
		}
		this.shellKeys.set(projectId, Object.keys(shells));

		this.snapshot = { projects, shells: shellStates };
		this.notify?.();
	}
}
