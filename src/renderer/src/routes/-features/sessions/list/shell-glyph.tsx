export function ShellGlyph({ active }: { active: boolean }) {
	return (
		<svg
			viewBox="-8 -8 16 16"
			className={`size-3.5 shrink-0 ${active ? "stroke-tertiary" : "stroke-outline-strong"}`}
			fill="none"
			strokeWidth="1.8"
			aria-label="Shell"
			role="img"
		>
			<path d="M-6 -5 L-1 0 L-6 5" />
			<path d="M1 5 L6 5" />
		</svg>
	);
}
