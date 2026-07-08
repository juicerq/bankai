import { Terminal as Screen } from "@xterm/headless";

// A Tab is a raw shell: a Bun PTY feeding an @xterm/headless vt100 engine.
// The engine holds the authoritative screen state; the renderable reads it.
// The user runs `claude`/`cc` themselves inside the shell — we don't wrap it.

const SHELL = process.env.SHELL ?? "/bin/bash";
const SCROLLBACK = 10000;

type Tab = {
	pty: Bun.Terminal;
	proc: Bun.Subprocess;
	screen: Screen;
	exitListeners: Set<(code: number) => void>;
	inputListeners: Set<() => void>;
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
		const screen = new Screen({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true });

		const pty = new Bun.Terminal({
			cols,
			rows,
			name: "xterm-256color",
			data: (_pty, bytes) => {
				screen.write(bytes);
			},
			exit: (_pty, code) => this.notifyExit(id, code),
		});

		// The vt100 engine replies to the capability queries (DA, CPR, XTGETTINCAP, OSC
		// color) that shells and TUIs emit on startup and on every prompt redraw. Those
		// replies are the terminal's input side — pipe them back to the PTY or the program
		// blocks forever waiting on a probe that never returns. Keystrokes reach the PTY
		// straight through `input()`, so this only ever carries query replies, not echo.
		screen.onData((data) => pty.write(data));

		// `setsid -c` makes the shell a session leader with the pty as its controlling
		// terminal — without it job control fails (tcgetpgrp/setpgid) and strict shells
		// like fish refuse to start. Bun's `terminal` alloc doesn't do this itself, and
		// its `detached` flag only calls setsid without adopting the pty.
		const proc = Bun.spawn(["setsid", "-c", SHELL], {
			terminal: pty,
			cwd,
			env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
		});

		this.tabs.set(id, {
			pty,
			proc,
			screen,
			exitListeners: new Set(),
			inputListeners: new Set(),
		});

		return id;
	}

	input(id: string, data: string): void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return;
		}

		tab.pty.write(data);
		for (const listener of tab.inputListeners) {
			listener();
		}
	}

	onInput(id: string, listener: () => void): () => void {
		const tab = this.tabs.get(id);
		if (!tab) {
			return () => {};
		}

		tab.inputListeners.add(listener);
		return () => {
			tab.inputListeners.delete(listener);
		};
	}

	pids(): { tabId: string; pid: number }[] {
		return [...this.tabs].map(([tabId, tab]) => ({ tabId, pid: tab.proc.pid }));
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
