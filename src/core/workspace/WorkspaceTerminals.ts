import type { TabSupervisor } from "@core/terminal/TabSupervisor";

export class WorkspaceTerminals {
	private readonly stopWatching = new Map<string, () => void>();

	constructor(
		private readonly supervisor: TabSupervisor,
		tabIds: string[],
		private readonly onExit: (tabId: string) => void,
	) {
		for (const tabId of tabIds) {
			this.watch(tabId);
		}
	}

	open(cwd: string, command: string): string {
		const tabId = this.supervisor.open({ cwd, command });
		this.watch(tabId);
		return tabId;
	}

	close(tabId: string): void {
		this.stopWatching.get(tabId)?.();
		this.stopWatching.delete(tabId);
		this.supervisor.close(tabId);
	}

	closeAll(tabIds: string[]): void {
		for (const tabId of tabIds) {
			this.close(tabId);
		}
	}

	dispose(): void {
		for (const stop of this.stopWatching.values()) {
			stop();
		}
		this.stopWatching.clear();
	}

	private watch(tabId: string): void {
		const stop = this.supervisor.onExit(tabId, () => {
			this.stopWatching.delete(tabId);
			this.onExit(tabId);
		});
		this.stopWatching.set(tabId, stop);
	}
}
