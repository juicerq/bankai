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
		while (this.bytes > TERMINAL_RING_BYTES) {
			const oldest = this.chunks[0];
			if (!oldest) {
				return;
			}

			const excess = this.bytes - TERMINAL_RING_BYTES;
			if (excess >= oldest.byteLength) {
				this.chunks.shift();
				this.bytes -= oldest.byteLength;
				continue;
			}

			this.chunks[0] = oldest.subarray(excess);
			this.bytes -= excess;
		}
	}
}
