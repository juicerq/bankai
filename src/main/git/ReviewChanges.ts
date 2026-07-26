import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Logger } from "@main/logger";

export const REVIEW_CHANGE_DEBOUNCE_MS = 250;
const REVIEW_FALLBACK_INTERVAL_MS = 30_000;

interface WatchTarget {
	path: string;
	recursive: boolean;
}

export interface WatchPlan {
	targets: WatchTarget[];
	directories: string[];
}

interface ObservedProject {
	root: string;
	listeners: Set<() => void>;
	watchers: Map<string, FSWatcher>;
	directories: Set<string>;
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

	touch(path: string): void {
		const project = this.projects.get(path);
		if (!project) {
			return;
		}

		this.notify(project);
	}

	private observe(path: string): ObservedProject {
		const plan = reviewWatchPlan(path);
		const project: ObservedProject = {
			root: path,
			listeners: new Set(),
			watchers: new Map(),
			directories: new Set(plan.directories),
			fallback: setInterval(() => this.notify(project), REVIEW_FALLBACK_INTERVAL_MS),
		};
		project.fallback.unref();

		for (const target of plan.targets) {
			this.attach(project, target);
		}

		return project;
	}

	private attach(project: ObservedProject, target: WatchTarget): void {
		if (project.watchers.has(target.path)) {
			return;
		}

		try {
			const watcher = watch(target.path, { recursive: target.recursive }, () => this.schedule(project));
			project.watchers.set(target.path, watcher);
			watcher.on("error", (err) => {
				Logger.error("review-watch:error", { path: target.path, err: String(err) });
				watcher.close();
				project.watchers.delete(target.path);
			});
		} catch (err) {
			Logger.error("review-watch:unavailable", { path: target.path, err: String(err) });
		}
	}

	private adopt(project: ObservedProject): void {
		const directories = topLevelDirectories(project.root);
		if (directories.every((name) => project.directories.has(name))) {
			return;
		}

		const plan = reviewWatchPlan(project.root);
		project.directories = new Set(plan.directories);
		for (const target of plan.targets) {
			this.attach(project, target);
		}
	}

	private schedule(project: ObservedProject): void {
		if (project.debounce) {
			clearTimeout(project.debounce);
		}
		project.debounce = setTimeout(() => {
			project.debounce = undefined;
			this.adopt(project);
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
		for (const watcher of project.watchers.values()) {
			watcher.close();
		}
		project.watchers.clear();
	}
}

function topLevelDirectories(root: string): string[] {
	try {
		return readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

function ignoredDirectories(root: string, directories: string[]): Set<string> | null {
	if (directories.length === 0) {
		return new Set();
	}

	const listed = spawnSync("git", ["check-ignore", "--stdin"], {
		cwd: root,
		input: directories.join("\n"),
		encoding: "utf8",
	});
	if (listed.error || listed.status === null || listed.status > 1) {
		return null;
	}

	return new Set(listed.stdout.split("\n").map((name) => name.trim()).filter(Boolean));
}

function gitMetadataPaths(root: string): string[] {
	const dotGit = join(root, ".git");
	try {
		if (!statSync(dotGit).isFile()) {
			return [];
		}

		const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
		if (!match?.[1]) {
			return [];
		}

		const gitDirPath = match[1].trim();
		const gitDir = isAbsolute(gitDirPath) ? gitDirPath : resolve(dirname(dotGit), gitDirPath);
		const commonDir = readFileSync(join(gitDir, "commondir"), "utf8").trim();
		if (!commonDir) {
			return [gitDir];
		}

		return [gitDir, resolve(gitDir, commonDir)];
	} catch {
		return [];
	}
}

function isRepository(root: string): boolean {
	const probed = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd: root,
		encoding: "utf8",
	});

	return probed.stdout.trim() === "true";
}

export function reviewWatchPlan(root: string): WatchPlan {
	const directories = topLevelDirectories(root);
	if (!isRepository(root)) {
		return { targets: [{ path: root, recursive: false }], directories };
	}

	const metadata = gitMetadataPaths(root).map((path) => ({ path, recursive: true }));
	const ignored = ignoredDirectories(root, directories);
	if (!ignored) {
		return { targets: dedupe([{ path: root, recursive: true }, ...metadata]), directories };
	}

	const worktree = directories
		.filter((name) => !ignored.has(name))
		.map((name) => ({ path: join(root, name), recursive: true }));

	return {
		targets: dedupe([{ path: root, recursive: false }, ...worktree, ...metadata]),
		directories,
	};
}

function dedupe(targets: WatchTarget[]): WatchTarget[] {
	const byPath = new Map<string, WatchTarget>();
	for (const target of targets) {
		const existing = byPath.get(target.path);
		if (!existing || (target.recursive && !existing.recursive)) {
			byPath.set(target.path, target);
		}
	}

	return [...byPath.values()];
}

export const ReviewChanges = new ReviewChangeObserver();
