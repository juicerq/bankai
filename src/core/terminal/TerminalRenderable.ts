import { type OptimizedBuffer, Renderable, type RGBA } from "@opentui/core";
import type { IBuffer, IDisposable, Terminal as Screen } from "@xterm/headless";
import {
	defaultBackground,
	defaultForeground,
	resolveAttributes,
	resolveBackground,
	resolveForeground,
} from "@core/terminal/palette";

// Blits a headless terminal screen straight into openTUI's cell buffer. Not
// buffered — renderSelf paints into the root buffer at absolute cell coords, so
// there's no intermediate framebuffer between the vt100 grid and the screen.

export class TerminalRenderable extends Renderable {
	private screen: Screen | null = null;
	private cursorVisible = false;
	private laidOut: { cols: number; rows: number } | null = null;
	private writeSub: IDisposable | null = null;

	// Set by the React wrapper so a layout resize can resize the shell's PTY.
	onCellResize: ((cols: number, rows: number) => void) | null = null;

	// Set by the React wrapper: the block cursor's concrete colors. The theme lives in
	// the UI layer (core never imports it), so the colors are pushed in from there.
	cursorColors: { block: RGBA; text: RGBA } | null = null;

	get cellSize(): { cols: number; rows: number } | null {
		return this.laidOut;
	}

	// A terminal repaints when its grid changes, not on a clock. The xterm engine parses
	// PTY bytes asynchronously, so `onWriteParsed` is the one instant the grid is settled;
	// requesting a render there paints post-parse (no stale frame) and lets the renderer
	// idle when the shell is quiet. One paint on attach shows the current grid at once.
	attach(screen: Screen): void {
		this.screen = screen;
		this.writeSub = screen.onWriteParsed(() => this.requestRender());
		this.requestRender();
	}

	detach(): void {
		this.writeSub?.dispose();
		this.writeSub = null;
		this.screen = null;
	}

	setFocused(focused: boolean): void {
		this.cursorVisible = focused;
		this.requestRender();
	}

	protected override onResize(width: number, height: number): void {
		// width/height are the laid-out cell counts (cols/rows). Stashing them lets the
		// wrapper flush the real size on mount even if this fired before it bound the
		// handler — otherwise the PTY stays stuck at its placeholder size.
		this.laidOut = { cols: width, rows: height };

		const notify = this.onCellResize;
		if (notify) {
			process.nextTick(() => notify(width, height));
		}
	}

	protected override renderSelf(buffer: OptimizedBuffer): void {
		const grid = this.screen?.buffer.active;
		if (!grid) {
			return;
		}

		const cols = this.width;
		const rows = this.height;
		const scratch = grid.getNullCell();

		for (let row = 0; row < rows; row++) {
			const line = grid.getLine(grid.baseY + row);

			for (let col = 0; col < cols; col++) {
				const cell = line?.getCell(col, scratch);
				if (!cell) {
					buffer.setCell(
						this.x + col,
						this.y + row,
						" ",
						defaultForeground(),
						defaultBackground(),
					);
					continue;
				}

				let fg = resolveForeground(cell);
				let bg = resolveBackground(cell);
				if (cell.isInverse()) {
					const swap = fg;
					fg = bg;
					bg = swap;
				}

				buffer.setCell(
					this.x + col,
					this.y + row,
					cell.getChars() || " ",
					fg,
					bg,
					resolveAttributes(cell),
				);
			}
		}

		if (this.cursorVisible) {
			this.drawCursor(buffer, grid, cols, rows);
		}
	}

	private drawCursor(
		buffer: OptimizedBuffer,
		grid: IBuffer,
		cols: number,
		rows: number,
	): void {
		const colors = this.cursorColors;
		if (!colors || grid.cursorX >= cols || grid.cursorY >= rows) {
			return;
		}

		const char = grid.getLine(grid.baseY + grid.cursorY)?.getCell(grid.cursorX)?.getChars() || " ";

		// Solid block in a concrete color. Inverting the cell's own colors renders
		// invisible on an empty cell — where the cursor almost always sits — because the
		// default fg/bg are position-resolved sentinels that stay default when swapped.
		buffer.setCell(this.x + grid.cursorX, this.y + grid.cursorY, char, colors.text, colors.block);
	}
}
