import { watch, type FSWatcher } from "node:fs";
import { Logger } from "@main/logger";

export const REVIEW_CHANGE_DEBOUNCE_MS = 250;
const REVIEW_FALLBACK_INTERVAL_MS = 30_000;

type ObservedProject = {
	listeners: Set<() => void>;
	watcher?: FSWatcher;
	debounce?: ReturnType<typeof setTimeout>;
	fallback: ReturnType<typeof setInterval>;
};

class ReviewChangeObserver {
	private readonly projects = new Map<string, ObservedProject>();

	subscribe(path: string, listener: () => void): () => void {
		const project = this.projects.get(path) ?? this.observe(path);
		this.projects.set(path, project);
		project.listeners.add(listener);
		let subscribed = true;

		return () => {
			if (!subscribed) {
				return;
			}
			subscribed = false;
			project.listeners.delete(listener);
			if (project.listeners.size === 0) {
				this.close(project);
				if (this.projects.get(path) === project) {
					this.projects.delete(path);
				}
			}
		};
	}

	private observe(path: string): ObservedProject {
		const project: ObservedProject = {
			listeners: new Set(),
			fallback: setInterval(() => this.notify(project), REVIEW_FALLBACK_INTERVAL_MS),
		};
		project.fallback.unref();

		try {
			project.watcher = watch(path, { recursive: true }, () => this.schedule(project));
			project.watcher.on("error", (err) => {
				Logger.error("review-watch:error", { path, err: String(err) });
				project.watcher?.close();
				project.watcher = undefined;
			});
		} catch (err) {
			Logger.error("review-watch:unavailable", { path, err: String(err) });
		}

		return project;
	}

	private schedule(project: ObservedProject): void {
		if (project.debounce) {
			clearTimeout(project.debounce);
		}
		project.debounce = setTimeout(() => {
			project.debounce = undefined;
			this.notify(project);
		}, REVIEW_CHANGE_DEBOUNCE_MS);
		project.debounce.unref();
	}

	private notify(project: ObservedProject): void {
		for (const listener of project.listeners) {
			listener();
		}
	}

	private close(project: ObservedProject): void {
		if (project.debounce) {
			clearTimeout(project.debounce);
		}
		clearInterval(project.fallback);
		project.watcher?.close();
	}
}

export const ReviewChanges = new ReviewChangeObserver();
