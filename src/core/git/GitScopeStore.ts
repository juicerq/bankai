import { GIT_REFRESH_INTERVAL_MS, watchGitRefresh } from "@core/git/gitRefreshWatcher";
import { type GitScope, type GitScopeResult, gitScopeChanges } from "@core/git/gitScope";
import { Logger } from "@core/logger";

export type GitScopeState = GitScopeResult | { status: "loading" };

const LOADING: GitScopeState = { status: "loading" };

type Entry = {
	dir: string;
	scope: GitScope;
	state: GitScopeState;
	watchers: number;
	stopWatch: (() => void) | null;
	request: number;
};

class GitScopeStore {
	private readonly entries = new Map<string, Entry>();
	private readonly listeners = new Set<() => void>();

	get(dir: string, scope: GitScope): GitScopeState {
		return this.entries.get(`${scope}\0${dir}`)?.state ?? LOADING;
	}

	watch(dir: string, scope: GitScope, listener: () => void): () => void {
		const key = `${scope}\0${dir}`;
		const entry = this.entries.get(key) ?? {
			dir,
			scope,
			state: LOADING,
			watchers: 0,
			stopWatch: null,
			request: 0,
		};
		this.entries.set(key, entry);
		this.listeners.add(listener);
		entry.watchers++;

		if (entry.watchers === 1) {
			this.load(entry);
			entry.stopWatch = watchGitRefresh({
				dir: entry.dir,
				intervalMs: GIT_REFRESH_INTERVAL_MS,
				onChange: () => this.load(entry),
			});
		}

		return () => {
			this.listeners.delete(listener);
			entry.watchers--;

			if (entry.watchers === 0) {
				entry.request++;
				entry.stopWatch?.();
				entry.stopWatch = null;
			}
		};
	}

	private load(entry: Entry): void {
		const id = ++entry.request;

		gitScopeChanges({ dir: entry.dir, scope: entry.scope })
			.then((result) => {
				if (entry.request === id) {
					entry.state = result;
					this.notify();
				}
			})
			.catch((err) => {
				Logger.error("review:git-scope-failed", String(err));

				if (entry.request === id) {
					entry.state = { status: "unavailable" };
					this.notify();
				}
			});
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

export const GitScopes = new GitScopeStore();
