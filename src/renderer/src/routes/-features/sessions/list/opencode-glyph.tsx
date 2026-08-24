const OPEN_LOOP =
	"M19.07 4.93 A 10 10 0 1 0 19.07 19.07 L 16.6 16.59 A 6.5 6.5 0 1 1 16.6 7.41 Z M15.5 8.8 L21 12 L15.5 15.2 Z";

export function OpencodeGlyph({ active }: { active: boolean }) {
	return (
		<svg
			viewBox="0 0 24 24"
			className={`size-3.5 shrink-0 ${active ? "fill-tertiary" : "fill-outline-strong"}`}
			aria-label="OpenCode"
			role="img"
		>
			<path d={OPEN_LOOP} />
		</svg>
	);
}
