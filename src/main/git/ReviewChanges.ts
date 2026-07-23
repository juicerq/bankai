import { readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Logger } from "@main/logger";

export const REVIEW_CHANGE_DEBOUNCE_MS = 250;
const REVIEW_FALLBACK_INTERVAL_MS = 30_000;

interface ObservedProject {
	listeners: Set<() => void>;
	watchers: FSWatcher[];
	debounce?: ReturnType<typeof setTimeout>;
	fallback: ReturnType<typeof setInterval>;
}

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
			watchers: [],
			fallback: setInterval(() => this.notify(project), REVIEW_FALLBACK_INTERVAL_MS),
		};
		project.fallback.unref();

		for (const watchedPath of reviewWatchPaths(path)) {
			try {
				const watcher = watch(watchedPath, { recursive: true }, () => this.schedule(project));
				project.watchers.push(watcher);
				watcher.on("error", (err) => {
					Logger.error("review-watch:error", { path: watchedPath, err: String(err) });
					watcher.close();
				});
			} catch (err) {
				Logger.error("review-watch:unavailable", { path: watchedPath, err: String(err) });
			}
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
		for (const watcher of project.watchers) {
			watcher.close();
		}
	}
}

function reviewWatchPaths(root: string): string[] {
	const paths = [root];
	const dotGit = join(root, ".git");
	try {
		if (!statSync(dotGit).isFile()) {
			return paths;
		}

		const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
		if (!match?.[1]) {
			return paths;
		}

		const gitDirPath = match[1].trim();
		const gitDir = isAbsolute(gitDirPath) ? gitDirPath : resolve(dirname(dotGit), gitDirPath);
		paths.push(gitDir);
		const commonDir = readFileSync(join(gitDir, "commondir"), "utf8").trim();
		if (commonDir) {
			paths.push(resolve(gitDir, commonDir));
		}
	} catch {
		return paths;
	}

	return [...new Set(paths)];
}

export const ReviewChanges = new ReviewChangeObserver();
