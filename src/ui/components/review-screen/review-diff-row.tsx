import { RGBA, type TextChunk } from "@opentui/core";
import type { DiffRow } from "@core/review/diff";
import { theme } from "@ui/theme";

const GUTTER = 4;

const MARKER: Record<DiffRow["kind"], { glyph: string; fg: string }> = {
	context: { glyph: " ", fg: theme.textFaint },
	add: { glyph: "+", fg: theme.add },
	replace: { glyph: "~", fg: theme.accent },
	remove: { glyph: "-", fg: theme.danger },
	removed: { glyph: "⋯", fg: theme.danger },
	skipped: { glyph: "⋯", fg: theme.textFaint },
	"too-large": { glyph: "!", fg: theme.accent },
};

const DIM_BG = RGBA.fromHex(theme.bg);
const DIM_BASE = RGBA.fromHex(theme.text);

function dimmed(color: RGBA | undefined): RGBA {
	const base = color ?? DIM_BASE;

	return RGBA.fromValues(
		DIM_BG.r + (base.r - DIM_BG.r) * 0.3,
		DIM_BG.g + (base.g - DIM_BG.g) * 0.3,
		DIM_BG.b + (base.b - DIM_BG.b) * 0.3,
		1,
	);
}

export function ReviewDiffRow({
	row,
	styledLines,
}: {
	row: DiffRow;
	styledLines: TextChunk[][] | undefined;
}) {
	const marker = MARKER[row.kind];
	if (row.kind === "too-large") {
		return (
			<text style={{ fg: marker.fg }}>
				{`${" ".repeat(GUTTER)} ${marker.glyph} diff too large (${row.beforeCount} → ${row.afterCount} lines)`}
			</text>
		);
	}

	if (row.kind === "skipped") {
		return (
			<text style={{ fg: marker.fg }}>
				{`${" ".repeat(GUTTER)} ${marker.glyph} ${row.count} ${row.count === 1 ? "line" : "lines"}`}
			</text>
		);
	}

	if (row.kind === "removed" || row.kind === "remove") {
		const body = row.kind === "removed"
			? `${row.count} ${row.count === 1 ? "line removed" : "lines removed"}`
			: row.text;

		return (
			<text style={{ fg: marker.fg }}>
				<span style={{ fg: theme.textFaint }}>{`${" ".repeat(GUTTER)} `}</span>
				{`${marker.glyph} ${body}`}
			</text>
		);
	}

	const gutter = `${String(row.line).padStart(GUTTER)} `;
	const chunks = styledLines?.[row.line - 1];

	if (!chunks) {
		return (
			<text style={{ fg: marker.fg }}>
				<span style={{ fg: theme.textFaint }}>{gutter}</span>
				{`${marker.glyph} ${row.text}`}
			</text>
		);
	}

	return (
		<text style={{ fg: theme.text }}>
			<span style={{ fg: theme.textFaint }}>{gutter}</span>
			<span style={{ fg: marker.fg }}>{`${marker.glyph} `}</span>
			{chunks.map((chunk, i) => (
				<span
					key={String(i)}
					style={{
						fg: row.kind === "context" ? dimmed(chunk.fg) : chunk.fg,
						bg: chunk.bg,
						attributes: chunk.attributes,
					}}
				>
					{chunk.text}
				</span>
			))}
		</text>
	);
}
