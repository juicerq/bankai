import type { IBuffer } from "@xterm/headless";

const SCROLL_LINES = 3;

export class TerminalViewport {
	private offset = 0;
	private lastBaseY = 0;

	attach(grid: IBuffer): void {
		this.lastBaseY = grid.baseY;
	}

	get scrollOffset(): number {
		return this.offset;
	}

	top(grid: IBuffer): number {
		return Math.max(0, grid.baseY - this.offset);
	}

	snapToLive(): boolean {
		if (this.offset === 0) {
			return false;
		}

		this.offset = 0;
		return true;
	}

	scroll(grid: IBuffer, direction: "up" | "down", delta: number): boolean {
		if (grid.type === "alternate") {
			return false;
		}

		const lines = delta * SCROLL_LINES;
		this.offset = direction === "up"
			? Math.min(this.offset + lines, grid.baseY)
			: Math.max(this.offset - lines, 0);
		return true;
	}

	onWrite(grid: IBuffer): void {
		if (grid.type === "alternate") {
			this.offset = 0;
		} else if (this.offset > 0) {
			const growth = grid.baseY - this.lastBaseY;
			if (growth > 0) {
				this.offset = Math.min(this.offset + growth, grid.baseY);
			}
		}

		this.lastBaseY = grid.baseY;
	}
}
