import { SerializeAddon } from "@xterm/addon-serialize";
import headless from "@xterm/headless";

const { Terminal } = headless;

const TERMINAL_MIRROR_SCROLLBACK = 10_000;

export interface TerminalSize {
	cols: number;
	rows: number;
}

export class TerminalMirror {
	private readonly terminal: InstanceType<typeof Terminal>;
	private readonly serializer = new SerializeAddon();
	private pending: Promise<void> = Promise.resolve();

	constructor(size: TerminalSize) {
		this.terminal = new Terminal({
			cols: size.cols,
			rows: size.rows,
			scrollback: TERMINAL_MIRROR_SCROLLBACK,
			allowProposedApi: true,
		});
		this.terminal.loadAddon(this.serializer);
	}

	write(data: string): void {
		this.pending = new Promise((resolve) => this.terminal.write(data, resolve));
	}

	resize(size: TerminalSize): void {
		this.terminal.resize(size.cols, size.rows);
	}

	async drain(): Promise<void> {
		let awaited: Promise<void>;

		do {
			awaited = this.pending;
			await awaited;
		} while (awaited !== this.pending);
	}

	async snapshot(): Promise<string> {
		await this.drain();

		return this.serializer.serialize();
	}
}
