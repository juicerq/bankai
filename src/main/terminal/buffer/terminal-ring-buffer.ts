export const TERMINAL_RING_BYTES = 1024 * 1024;

export class TerminalRingBuffer {
	private chunks: Buffer[] = [];
	private bytes = 0;

	append(data: string): void {
		const chunk = Buffer.from(data, "utf8");
		this.chunks.push(chunk);
		this.bytes += chunk.byteLength;
		this.trim();
	}

	read(): string {
		return Buffer.concat(this.chunks).toString("utf8");
	}

	private trim(): void {
		while (this.bytes > TERMINAL_RING_BYTES && this.chunks.length > 1) {
			const oldest = this.chunks.shift();
			if (!oldest) {
				return;
			}

			this.bytes -= oldest.byteLength;
		}
	}
}
