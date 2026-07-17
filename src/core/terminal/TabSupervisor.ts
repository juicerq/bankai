import type { Terminal as Screen } from "@xterm/headless";
import { TerminalTab } from "@core/terminal/TerminalTab";

type OpenOptions = {
	cwd: string;
	cols?: number;
	rows?: number;
};

export class TabSupervisor {
	private readonly tabs = new Map<string, TerminalTab>();
	private sequence = 0;

	open(options: OpenOptions): string {
		const id = `tab-${++this.sequence}`;
		const tab = TerminalTab.open(options, () => this.tabs.delete(id));
		this.tabs.set(id, tab);
		return id;
	}

	input(id: string, data: string): void {
		this.tabs.get(id)?.input(data);
	}

	onInput(id: string, listener: () => void): () => void {
		return this.tabs.get(id)?.onInput(listener) ?? (() => {});
	}

	pids(): { tabId: string; pid: number }[] {
		return [...this.tabs].map(([tabId, tab]) => ({ tabId, pid: tab.pid }));
	}

	resize(id: string, cols: number, rows: number): void {
		this.tabs.get(id)?.resize(cols, rows);
	}

	screen(id: string): Screen | undefined {
		return this.tabs.get(id)?.screen;
	}

	onExit(id: string, listener: (code: number) => void): () => void {
		return this.tabs.get(id)?.onExit(listener) ?? (() => {});
	}

	disposeAll(): void {
		for (const tab of this.tabs.values()) {
			tab.close();
		}
	}

	close(id: string): void {
		this.tabs.get(id)?.close();
	}
}
