import { type OptimizedBuffer, Renderable } from "@opentui/core";
import type { IBuffer, Terminal as Screen } from "@xterm/headless";
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

	// Set by the React wrapper so a layout resize can resize the shell's PTY.
	onCellResize: ((cols: number, rows: number) => void) | null = null;

	attach(screen: Screen): void {
		this.screen = screen;
		this.requestRender();
	}

	detach(): void {
		this.screen = null;
	}

	setFocused(focused: boolean): void {
		this.cursorVisible = focused;
		this.requestRender();
	}

	protected override onResize(width: number, height: number): void {
		// width/height are the laid-out cell counts (cols/rows). Fire off the render
		// pass — requesting a render mid-layout is dropped (see Renderable docs).
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
		if (grid.cursorX >= cols || grid.cursorY >= rows) {
			return;
		}

		const cell = grid.getLine(grid.baseY + grid.cursorY)?.getCell(grid.cursorX);
		const char = cell?.getChars() || " ";
		const fg = cell ? resolveForeground(cell) : defaultForeground();
		const bg = cell ? resolveBackground(cell) : defaultBackground();

		// Block cursor: invert the cell under it.
		buffer.setCell(this.x + grid.cursorX, this.y + grid.cursorY, char, bg, fg);
	}
}
