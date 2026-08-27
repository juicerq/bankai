const OPENCODE_MARK = "M27 0H3V30H27V0ZM21 6H9V24H21V6ZM21 12H9V24H21V12Z";

export function OpencodeGlyph({ active }: { active: boolean }) {
	return (
		<svg
			viewBox="0 0 30 30"
			className={`size-3.5 shrink-0 ${active ? "fill-tertiary" : "fill-outline-strong"}`}
			aria-label="OpenCode"
			role="img"
		>
			<path d={OPENCODE_MARK} fillRule="evenodd" />
		</svg>
	);
}
