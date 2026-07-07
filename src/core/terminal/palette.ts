import { RGBA, TextAttributes } from "@opentui/core";
import type { IBufferCell } from "@xterm/headless";

// Bridge xterm/headless cell colors into openTUI RGBA. Palette (0-255) and the
// two default colors are resolved once and cached — a live terminal repaints
// every cell every frame, so per-cell allocation would dominate the render.

const paletteCache: RGBA[] = [];
let defaultFg: RGBA | null = null;
let defaultBg: RGBA | null = null;

function paletteColor(index: number): RGBA {
	return (paletteCache[index] ??= RGBA.fromIndex(index));
}

function rgbColor(value: number): RGBA {
	return RGBA.fromInts((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

export function defaultForeground(): RGBA {
	return (defaultFg ??= RGBA.defaultForeground());
}

export function defaultBackground(): RGBA {
	return (defaultBg ??= RGBA.defaultBackground());
}

export function resolveForeground(cell: IBufferCell): RGBA {
	if (cell.isFgDefault()) {
		return defaultForeground();
	}

	const color = cell.getFgColor();
	return cell.isFgPalette() ? paletteColor(color) : rgbColor(color);
}

export function resolveBackground(cell: IBufferCell): RGBA {
	if (cell.isBgDefault()) {
		return defaultBackground();
	}

	const color = cell.getBgColor();
	return cell.isBgPalette() ? paletteColor(color) : rgbColor(color);
}

export function resolveAttributes(cell: IBufferCell): number {
	let attributes = TextAttributes.NONE;

	if (cell.isBold()) {
		attributes |= TextAttributes.BOLD;
	}
	if (cell.isDim()) {
		attributes |= TextAttributes.DIM;
	}
	if (cell.isItalic()) {
		attributes |= TextAttributes.ITALIC;
	}
	if (cell.isUnderline()) {
		attributes |= TextAttributes.UNDERLINE;
	}
	if (cell.isBlink()) {
		attributes |= TextAttributes.BLINK;
	}
	if (cell.isStrikethrough()) {
		attributes |= TextAttributes.STRIKETHROUGH;
	}
	if (cell.isInvisible()) {
		attributes |= TextAttributes.HIDDEN;
	}

	return attributes;
}
