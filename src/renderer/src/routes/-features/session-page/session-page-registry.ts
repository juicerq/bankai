import type { SessionPageState } from "@shared/session-page";

interface SessionPageEntry {
	url?: string;
	navigation: number;
	state?: SessionPageState;
}

function displayUrl(entry: SessionPageEntry | undefined) {
	const value = entry?.state?.url ?? entry?.url;

	if (!value) {
		return "";
	}

	const url = new URL(value);

	return `${url.origin}${url.pathname}`;
}

function create() {
	let entries = new Map<string, SessionPageEntry>();
	let snapshot = 0;
	const listeners = new Set<() => void>();
	const publish = () => {
		snapshot += 1;
		for (const listener of listeners) {
			listener();
		}
	};

	return {
		subscribe(listener: () => void) {
			listeners.add(listener);

			return () => listeners.delete(listener);
		},
		getSnapshot: () => snapshot,
		get: (shellId: string) => entries.get(shellId),
		has: (shellId: string) => entries.has(shellId),
		displayUrl: (shellId: string) => displayUrl(entries.get(shellId)),
		blank(shellId: string) {
			if (entries.has(shellId)) {
				return;
			}

			entries = new Map(entries).set(shellId, { navigation: 0 });
			publish();
		},
		close(shellId: string) {
			const current = entries.get(shellId);

			if (!current || current.url) {
				return;
			}

			entries = new Map(entries);
			entries.delete(shellId);
			publish();
		},
		open(shellId: string, url: string) {
			const navigation = (entries.get(shellId)?.navigation ?? 0) + 1;
			entries = new Map(entries).set(shellId, { url, navigation });
			publish();
		},
		update(state: SessionPageState) {
			if (!state.shellId) {
				return;
			}

			const current = entries.get(state.shellId);
			if (!current) {
				return;
			}

			entries = new Map(entries).set(state.shellId, { ...current, state });
			publish();
		},
		async release(shellIds: string[]) {
			const pageShellIds = shellIds.filter((shellId) => entries.has(shellId));
			if (pageShellIds.length === 0) {
				return;
			}

			entries = new Map(entries);
			for (const shellId of pageShellIds) {
				entries.delete(shellId);
			}
			publish();

			if (typeof window === "undefined") {
				return;
			}
			const bridge = window.bankaiSessionPage;
			if (!bridge) {
				return;
			}

			await Promise.all(pageShellIds.map((shellId) => bridge.release(shellId).catch(() => {})));
		},
	};
}

export type SessionPageRegistryValue = ReturnType<typeof create>;

export const SessionPageRegistry = { create };
