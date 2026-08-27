const OPENCODE_MARK = "M24 0H0V24H24V0ZM19 5H5V19H19V5ZM19 11H5V19H19V11Z";

export function OpencodeGlyph({ active }: { active: boolean }) {
	return (
		<svg
			viewBox="-1.6 -1.6 27.2 27.2"
			className={`size-3.5 shrink-0 ${active ? "fill-tertiary" : "fill-outline-strong"}`}
			aria-label="OpenCode"
			role="img"
		>
			<path d={OPENCODE_MARK} fillRule="evenodd" />
		</svg>
	);
}
