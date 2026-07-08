import { type MouseEvent, type OptimizedBuffer, Renderable, type RGBA, TextAttributes } from "@opentui/core";
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

const SCROLL_LINES = 3;

type Cell = { line: number; col: number };
type Span = { start: Cell; end: Cell };

function orderCells(a: Cell, b: Cell): Span {
	if (a.line < b.line || (a.line === b.line && a.col <= b.col)) {
		return { start: a, end: b };
	}

	return { start: b, end: a };
}

function withinSpan(span: Span, line: number, col: number): boolean {
	if (line < span.start.line || line > span.end.line) {
		return false;
	}

	if (span.start.line === span.end.line) {
		return col >= span.start.col && col <= span.end.col;
	}

	if (line === span.start.line) {
		return col >= span.start.col;
	}

	if (line === span.end.line) {
		return col <= span.end.col;
	}

	return true;
}

export class TerminalRenderable extends Renderable {
	private screen: Screen | null = null;
	private cursorVisible = false;
	private laidOut: { cols: number; rows: number } | null = null;
	private writeSub: IDisposable | null = null;
	private scrollOffset = 0;
	private lastBaseY = 0;
	private anchor: Cell | null = null;
	private selection: Span | null = null;

	// Set by the React wrapper so a layout resize can resize the shell's PTY.
	onCellResize: ((cols: number, rows: number) => void) | null = null;

	onCopy: ((text: string) => void) | null = null;

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
		this.lastBaseY = screen.buffer.active.baseY;
		this.writeSub = screen.onWriteParsed(() => this.onWrite());
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

	snapToLive(): void {
		if (this.scrollOffset === 0) {
			return;
		}

		this.scrollOffset = 0;
		this.requestRender();
	}

	protected override onMouseEvent(event: MouseEvent): void {
		const grid = this.screen?.buffer.active;
		if (!grid) {
			return;
		}

		if (event.type === "scroll") {
			this.handleScroll(event, grid);
			return;
		}

		this.handleSelection(event, grid);
	}

	private handleScroll(event: MouseEvent, grid: IBuffer): void {
		if (!event.scroll || grid.type === "alternate") {
			return;
		}

		const lines = event.scroll.delta * SCROLL_LINES;
		if (event.scroll.direction === "up") {
			this.scrollOffset = Math.min(this.scrollOffset + lines, grid.baseY);
		} else if (event.scroll.direction === "down") {
			this.scrollOffset = Math.max(this.scrollOffset - lines, 0);
		} else {
			return;
		}

		event.stopPropagation();
		this.requestRender();
	}

	private handleSelection(event: MouseEvent, grid: IBuffer): void {
		if (event.type === "down") {
			if (event.button !== 0) {
				return;
			}

			this.anchor = this.cellAt(event, grid);
			this.selection = null;
			event.stopPropagation();
			this.requestRender();
			return;
		}

		if (event.type === "drag") {
			if (!this.anchor) {
				return;
			}

			this.selection = orderCells(this.anchor, this.cellAt(event, grid));
			event.stopPropagation();
			this.requestRender();
			return;
		}

		if (event.type === "drag-end") {
			this.anchor = null;
			const text = this.selectedText(grid);
			if (text) {
				this.onCopy?.(text);
			}

			event.stopPropagation();
		}
	}

	private cellAt(event: MouseEvent, grid: IBuffer): Cell {
		const col = Math.min(Math.max(event.x - this.x, 0), this.width - 1);
		const row = Math.min(Math.max(event.y - this.y, 0), this.height - 1);
		const top = Math.max(0, grid.baseY - this.scrollOffset);

		return { line: top + row, col };
	}

	private selectedText(grid: IBuffer): string {
		const span = this.selection;
		if (!span) {
			return "";
		}

		const lines: string[] = [];
		for (let cursor = span.start.line; cursor <= span.end.line; cursor++) {
			const buffered = grid.getLine(cursor);
			if (!buffered) {
				continue;
			}

			const from = cursor === span.start.line ? span.start.col : 0;
			const to = cursor === span.end.line ? span.end.col + 1 : undefined;
			lines.push(buffered.translateToString(true, from, to));
		}

		return lines.join("\n");
	}

	private onWrite(): void {
		const grid = this.screen?.buffer.active;
		if (grid) {
			if (grid.type === "alternate") {
				this.scrollOffset = 0;
			} else if (this.scrollOffset > 0) {
				const grew = grid.baseY - this.lastBaseY;
				if (grew > 0) {
					this.scrollOffset = Math.min(this.scrollOffset + grew, grid.baseY);
				}
			}

			this.lastBaseY = grid.baseY;
		}

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
		const top = Math.max(0, grid.baseY - this.scrollOffset);
		const span = this.selection;

		for (let row = 0; row < rows; row++) {
			const absLine = top + row;
			const line = grid.getLine(absLine);

			for (let col = 0; col < cols; col++) {
				const selected = span ? withinSpan(span, absLine, col) : false;
				const cell = line?.getCell(col, scratch);
				if (!cell) {
					buffer.setCell(
						this.x + col,
						this.y + row,
						" ",
						defaultForeground(),
						defaultBackground(),
						selected ? TextAttributes.INVERSE : TextAttributes.NONE,
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

				let attributes = resolveAttributes(cell);
				if (selected) {
					attributes |= TextAttributes.INVERSE;
				}

				buffer.setCell(this.x + col, this.y + row, cell.getChars() || " ", fg, bg, attributes);
			}
		}

		if (this.cursorVisible && this.scrollOffset === 0) {
			this.drawCursor(buffer, grid, cols, rows);
		}

		if (this.scrollOffset > 0) {
			this.drawScrollBadge(buffer, cols);
		}
	}

	private drawScrollBadge(buffer: OptimizedBuffer, cols: number): void {
		const colors = this.cursorColors;
		if (!colors) {
			return;
		}

		const label = ` SCROLL -${this.scrollOffset} `;
		const start = Math.max(0, cols - label.length);

		for (let i = 0; i < label.length; i++) {
			buffer.setCell(this.x + start + i, this.y, label[i] ?? " ", colors.text, colors.block);
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
