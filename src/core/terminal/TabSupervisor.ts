import { Terminal as Screen } from "@xterm/headless";

// A Tab is a raw shell: a Bun PTY feeding an @xterm/headless vt100 engine.
// The engine holds the authoritative screen state; the renderable reads it.
// The user runs `claude`/`cc` themselves inside the shell — we don't wrap it.

const SHELL = process.env.SHELL ?? "/bin/bash";

type Tab = {
	pty: Bun.Terminal;
	proc: Bun.Subprocess;
	screen: Screen;
	renderListeners: Set<() => void>;
	exitListeners: Set<(code: number) => void>;
};

type OpenOptions = {
	cwd: string;
	cols: number;
	rows: number;
};

export class TabSupervisor {
	private readonly tabs = new Map<string, Tab>();
	private seq = 0;

	open({ cwd, cols, rows }: OpenOptions): string {
		const id = `tab-${++this.seq}`;
		const screen = new Screen({ cols, rows, allowProposedApi: true });

		const pty = new Bun.Terminal({
			cols,
			rows,
			name: "xterm-256color",
			data: (_pty, bytes) => {
				screen.write(bytes);
				this.notifyRender(id);
			},
			exit: (_pty, code) => this.notifyExit(id, code),
		});

		const proc = Bun.spawn([SHELL], {
			terminal: pty,
			cwd,
			env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
		});

		this.tabs.set(id, {
			pty,
			proc,
			screen,
			renderListeners: new Set(),
			exitListeners: new Set(),
		});

		return id;
	}

	input(id: string, data: string): void {
		this.tabs.get(id)?.pty.write(data);
	}

	resize(id: string, cols: number, rows: number): void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return;
		}

		tab.pty.resize(cols, rows);
		tab.screen.resize(cols, rows);
	}

	screen(id: string): Screen | undefined {
		return this.tabs.get(id)?.screen;
	}

	onRender(id: string, listener: () => void): () => void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return () => {};
		}

		tab.renderListeners.add(listener);
		return () => {
			tab.renderListeners.delete(listener);
		};
	}

	onExit(id: string, listener: (code: number) => void): () => void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return () => {};
		}

		tab.exitListeners.add(listener);
		return () => {
			tab.exitListeners.delete(listener);
		};
	}

	// Idempotent: a shell the operator exits fires the PTY `exit` callback, and the
	// UI may also close the same tab — whichever runs second is a no-op.
	close(id: string): void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return;
		}

		if (tab.proc.exitCode === null) {
			tab.proc.kill();
		}
		if (!tab.pty.closed) {
			tab.pty.close();
		}
		tab.screen.dispose();
		this.tabs.delete(id);
	}

	private notifyRender(id: string): void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return;
		}

		for (const listener of tab.renderListeners) {
			listener();
		}
	}

	private notifyExit(id: string, code: number): void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return;
		}

		for (const listener of tab.exitListeners) {
			listener(code);
		}
	}
}
