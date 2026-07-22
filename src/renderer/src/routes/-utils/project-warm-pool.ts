const PROJECT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_INACTIVE_WARM_PROJECTS = 2;

const EMPTY_PROJECTS: readonly string[] = [];

type CancelTimer = () => void;
type ScheduleTimer = (callback: () => void, delay: number) => CancelTimer;

const scheduleTimer: ScheduleTimer = (callback, delay) => {
	const timer = window.setTimeout(callback, delay);
	return () => window.clearTimeout(timer);
};

export class ProjectWarmPool {
	private inactiveProjects: readonly string[] = EMPTY_PROJECTS;
	private readonly timers = new Map<string, CancelTimer>();
	private readonly listeners = new Set<() => void>();

	constructor(private readonly schedule: ScheduleTimer = scheduleTimer) {}

	readonly getSnapshot = () => this.inactiveProjects;

	readonly subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				this.dispose();
			}
		};
	};

	activate(projectId: string) {
		this.cancelExpiration(projectId);
		this.update(this.inactiveProjects.filter((id) => id !== projectId));
	}

	deactivate(projectId: string) {
		this.cancelExpiration(projectId);
		const next = [projectId, ...this.inactiveProjects.filter((id) => id !== projectId)];
		const retained = next.slice(0, MAX_INACTIVE_WARM_PROJECTS);
		for (const evicted of next.slice(MAX_INACTIVE_WARM_PROJECTS)) {
			this.cancelExpiration(evicted);
		}

		const cancel = this.schedule(() => {
			this.timers.delete(projectId);
			this.update(this.inactiveProjects.filter((id) => id !== projectId));
		}, PROJECT_IDLE_TIMEOUT_MS);
		this.timers.set(projectId, cancel);
		this.update(retained);
	}

	remove(projectId: string) {
		this.cancelExpiration(projectId);
		this.update(this.inactiveProjects.filter((id) => id !== projectId));
	}

	private dispose() {
		for (const cancel of this.timers.values()) {
			cancel();
		}
		this.timers.clear();
		this.inactiveProjects = EMPTY_PROJECTS;
	}

	private cancelExpiration(projectId: string) {
		this.timers.get(projectId)?.();
		this.timers.delete(projectId);
	}

	private update(next: readonly string[]) {
		if (
			next.length === this.inactiveProjects.length
			&& next.every((id, index) => id === this.inactiveProjects[index])
		) {
			return;
		}

		this.inactiveProjects = next.length === 0 ? EMPTY_PROJECTS : next;
		for (const listener of this.listeners) {
			listener();
		}
	}
}
