import type { IBuffer } from "@xterm/headless";

type Cell = { line: number; column: number };
type Span = { start: Cell; end: Cell };
type GridBounds = {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
};

function orderedSpan(first: Cell, second: Cell): Span {
	if (
		first.line < second.line
		|| (first.line === second.line && first.column <= second.column)
	) {
		return { start: first, end: second };
	}

	return { start: second, end: first };
}

export class TerminalSelection {
	private anchor: Cell | null = null;
	private span: Span | null = null;

	start(event: { x: number; y: number }, bounds: GridBounds): void {
		this.anchor = this.cellAt(event, bounds);
		this.span = null;
	}

	drag(event: { x: number; y: number }, bounds: GridBounds): boolean {
		if (!this.anchor) {
			return false;
		}

		this.span = orderedSpan(this.anchor, this.cellAt(event, bounds));
		return true;
	}

	finish(grid: IBuffer): string {
		this.anchor = null;
		if (!this.span) {
			return "";
		}

		const lines: string[] = [];
		for (let line = this.span.start.line; line <= this.span.end.line; line++) {
			const buffered = grid.getLine(line);
			if (!buffered) {
				continue;
			}

			const from = line === this.span.start.line ? this.span.start.column : 0;
			const to = line === this.span.end.line ? this.span.end.column + 1 : undefined;
			lines.push(buffered.translateToString(true, from, to));
		}

		return lines.join("\n");
	}

	contains(line: number, column: number): boolean {
		if (!this.span || line < this.span.start.line || line > this.span.end.line) {
			return false;
		}
		if (this.span.start.line === this.span.end.line) {
			return column >= this.span.start.column && column <= this.span.end.column;
		}
		if (line === this.span.start.line) {
			return column >= this.span.start.column;
		}
		if (line === this.span.end.line) {
			return column <= this.span.end.column;
		}

		return true;
	}

	private cellAt(event: { x: number; y: number }, bounds: GridBounds): Cell {
		const column = Math.min(Math.max(event.x - bounds.x, 0), bounds.width - 1);
		const row = Math.min(Math.max(event.y - bounds.y, 0), bounds.height - 1);
		return { line: bounds.top + row, column };
	}
}
