import {
	type MouseEvent,
	type OptimizedBuffer,
	Renderable,
	type RGBA,
	TextAttributes,
} from "@opentui/core";
import type { IBuffer, IDisposable, Terminal as Screen } from "@xterm/headless";
import {
	defaultBackground,
	defaultForeground,
	resolveAttributes,
	resolveBackground,
	resolveForeground,
} from "@core/terminal/palette";
import { TerminalSelection } from "@core/terminal/TerminalSelection";
import { TerminalViewport } from "@core/terminal/TerminalViewport";
import {
	terminalMouseEncoding,
	terminalWheelSequence,
} from "@core/terminal/terminalMouse";

export class TerminalRenderable extends Renderable {
	private readonly viewport = new TerminalViewport();
	private readonly selection = new TerminalSelection();
	private screen: Screen | null = null;
	private writeSubscription: IDisposable | null = null;
	private cursorVisible = false;
	private laidOut: { cols: number; rows: number } | null = null;

	onCellResize: ((cols: number, rows: number) => void) | null = null;
	onCopy: ((text: string) => void) | null = null;
	onInput: ((data: string) => void) | null = null;
	cursorColors: { block: RGBA; text: RGBA } | null = null;

	get cellSize(): { cols: number; rows: number } | null {
		return this.laidOut;
	}

	attach(screen: Screen): void {
		this.screen = screen;
		this.viewport.attach(screen.buffer.active);
		this.writeSubscription = screen.onWriteParsed(() => {
			this.viewport.onWrite(screen.buffer.active);
			this.requestRender();
		});
		this.requestRender();
	}

	detach(): void {
		this.writeSubscription?.dispose();
		this.writeSubscription = null;
		this.screen = null;
	}

	setFocused(focused: boolean): void {
		this.cursorVisible = focused;
		this.requestRender();
	}

	snapToLive(): void {
		if (this.viewport.snapToLive()) {
			this.requestRender();
		}
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

	protected override onResize(width: number, height: number): void {
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

		const top = this.viewport.top(grid);
		const scratch = grid.getNullCell();

		for (let row = 0; row < this.height; row++) {
			const absoluteLine = top + row;
			const line = grid.getLine(absoluteLine);

			for (let column = 0; column < this.width; column++) {
				const selected = this.selection.contains(absoluteLine, column);
				const cell = line?.getCell(column, scratch);
				if (!cell) {
					buffer.setCell(
						this.x + column,
						this.y + row,
						" ",
						defaultForeground(),
						defaultBackground(),
						selected ? TextAttributes.INVERSE : TextAttributes.NONE,
					);
					continue;
				}

				let foreground = resolveForeground(cell);
				let background = resolveBackground(cell);
				if (cell.isInverse()) {
					[foreground, background] = [background, foreground];
				}

				let attributes = resolveAttributes(cell);
				if (selected) {
					attributes |= TextAttributes.INVERSE;
				}

				buffer.setCell(
					this.x + column,
					this.y + row,
					cell.getChars() || " ",
					foreground,
					background,
					attributes,
				);
			}
		}

		if (this.cursorVisible && this.viewport.scrollOffset === 0) {
			this.drawCursor(buffer, grid);
		}
		if (this.viewport.scrollOffset > 0) {
			this.drawScrollBadge(buffer);
		}
	}

	private handleScroll(event: MouseEvent, grid: IBuffer): void {
		if (!event.scroll) {
			return;
		}
		if (this.screen?.modes.mouseTrackingMode !== "none") {
			this.forwardWheel(event);
			return;
		}
		if (event.scroll.direction !== "up" && event.scroll.direction !== "down") {
			return;
		}
		if (!this.viewport.scroll(grid, event.scroll.direction, event.scroll.delta)) {
			return;
		}

		event.stopPropagation();
		this.requestRender();
	}

	private forwardWheel(event: MouseEvent): void {
		if (
			!event.scroll
			|| !this.screen
			|| !this.onInput
			|| (event.scroll.direction !== "up" && event.scroll.direction !== "down")
		) {
			return;
		}

		const column = Math.min(Math.max(event.x - this.x, 0), this.width - 1) + 1;
		const row = Math.min(Math.max(event.y - this.y, 0), this.height - 1) + 1;
		const button = event.scroll.direction === "up" ? 64 : 65;
		const sequence = terminalWheelSequence(
			terminalMouseEncoding(this.screen),
			button,
			column,
			row,
		);

		for (let notch = 0; notch < Math.max(1, Math.trunc(event.scroll.delta)); notch++) {
			this.onInput(sequence);
		}
		event.stopPropagation();
	}

	private handleSelection(event: MouseEvent, grid: IBuffer): void {
		const bounds = {
			x: this.x,
			y: this.y,
			width: this.width,
			height: this.height,
			top: this.viewport.top(grid),
		};

		if (event.type === "down" && event.button === 0) {
			this.selection.start(event, bounds);
			event.stopPropagation();
			this.requestRender();
			return;
		}
		if (event.type === "drag" && this.selection.drag(event, bounds)) {
			event.stopPropagation();
			this.requestRender();
			return;
		}
		if (event.type === "drag-end") {
			const text = this.selection.finish(grid);
			if (text) {
				this.onCopy?.(text);
			}
			event.stopPropagation();
		}
	}

	private drawScrollBadge(buffer: OptimizedBuffer): void {
		if (!this.cursorColors) {
			return;
		}

		const label = ` SCROLL -${this.viewport.scrollOffset} `;
		const start = Math.max(0, this.width - label.length);
		for (let index = 0; index < label.length; index++) {
			buffer.setCell(
				this.x + start + index,
				this.y,
				label[index] ?? " ",
				this.cursorColors.text,
				this.cursorColors.block,
			);
		}
	}

	private drawCursor(buffer: OptimizedBuffer, grid: IBuffer): void {
		if (
			!this.cursorColors
			|| grid.cursorX >= this.width
			|| grid.cursorY >= this.height
		) {
			return;
		}

		const character = grid.getLine(grid.baseY + grid.cursorY)
			?.getCell(grid.cursorX)
			?.getChars() || " ";
		buffer.setCell(
			this.x + grid.cursorX,
			this.y + grid.cursorY,
			character,
			this.cursorColors.text,
			this.cursorColors.block,
		);
	}
}
