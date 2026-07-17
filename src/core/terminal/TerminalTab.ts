import { type IDisposable, Terminal as Screen } from "@xterm/headless";

const SHELL = process.env.SHELL ?? "/bin/bash";
const SCROLLBACK = 10000;

type OpenOptions = {
	cwd: string;
	cols?: number;
	rows?: number;
};

export class TerminalTab {
	private readonly exitListeners = new Set<(code: number) => void>();
	private readonly inputListeners = new Set<() => void>();
	private closed = false;

	private constructor(
		private readonly pty: Bun.Terminal,
		private readonly process: Bun.Subprocess,
		readonly screen: Screen,
		private readonly screenInput: IDisposable,
		private readonly onClosed: () => void,
	) {}

	static open(
		{ cwd, cols = 80, rows = 24 }: OpenOptions,
		onClosed: () => void,
	): TerminalTab {
		const screen = new Screen({
			cols,
			rows,
			scrollback: SCROLLBACK,
			allowProposedApi: true,
		});
		let pty: Bun.Terminal | null = null;
		let screenInput: IDisposable | null = null;

		try {
			let tab: TerminalTab | null = null;
			pty = new Bun.Terminal({
				cols,
				rows,
				name: "xterm-256color",
				data: (_terminal, bytes) => screen.write(bytes),
				exit: (_terminal, code) => tab?.handleExit(code),
			});
			screenInput = screen.onData((data) => pty?.write(data));
			const process = Bun.spawn(["setsid", "-c", SHELL], {
				terminal: pty,
				cwd,
				env: {
					...globalThis.process.env,
					TERM: "xterm-256color",
					COLORTERM: "truecolor",
				},
			});
			tab = new TerminalTab(pty, process, screen, screenInput, onClosed);
			return tab;
		} catch (error) {
			screenInput?.dispose();
			if (pty && !pty.closed) {
				pty.close();
			}
			screen.dispose();
			throw error;
		}
	}

	get pid(): number {
		return this.process.pid;
	}

	input(data: string): void {
		if (this.closed) {
			return;
		}

		this.pty.write(data);
		for (const listener of this.inputListeners) {
			listener();
		}
	}

	onInput(listener: () => void): () => void {
		this.inputListeners.add(listener);
		return () => this.inputListeners.delete(listener);
	}

	onExit(listener: (code: number) => void): () => void {
		this.exitListeners.add(listener);
		return () => this.exitListeners.delete(listener);
	}

	resize(cols: number, rows: number): void {
		if (this.closed) {
			return;
		}

		this.pty.resize(cols, rows);
		this.screen.resize(cols, rows);
	}

	close(): void {
		if (this.closed) {
			return;
		}

		if (this.process.exitCode === null) {
			this.process.kill();
		}
		this.dispose();
	}

	private handleExit(code: number): void {
		if (this.closed) {
			return;
		}

		for (const listener of this.exitListeners) {
			listener(code);
		}
		this.dispose();
	}

	private dispose(): void {
		this.closed = true;
		this.screenInput.dispose();
		if (!this.pty.closed) {
			this.pty.close();
		}
		this.screen.dispose();
		this.exitListeners.clear();
		this.inputListeners.clear();
		this.onClosed();
	}
}
