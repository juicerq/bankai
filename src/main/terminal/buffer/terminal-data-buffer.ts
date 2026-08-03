export const TERMINAL_DATA_FLUSH_MS = 8;

export class TerminalDataBuffer {
	private chunks: string[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;

	constructor(private readonly emit: (data: string) => void) {}

	append(data: string): void {
		if (this.disposed) {
			return;
		}
		this.chunks.push(data);
		this.flushTimer ??= setTimeout(() => this.flush(), TERMINAL_DATA_FLUSH_MS);
	}

	flush(): void {
		if (this.flushTimer !== undefined) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		if (this.chunks.length === 0) {
			return;
		}

		const data = this.chunks.join("");
		this.chunks = [];
		this.emit(data);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.flush();
	}
}
