const AXIS_RAY = "M0 0 C1.2 -4 1.2 -8 0 -11.5 C-1.2 -8 -1.2 -4 0 0 Z";
const DIAGONAL_RAY = "M0 0 C1 -3 1 -6.5 0 -9 C-1 -6.5 -1 -3 0 0 Z";

const RAYS = [
	{ angle: 0, d: AXIS_RAY },
	{ angle: 45, d: DIAGONAL_RAY },
	{ angle: 90, d: AXIS_RAY },
	{ angle: 135, d: DIAGONAL_RAY },
	{ angle: 180, d: AXIS_RAY },
	{ angle: 225, d: DIAGONAL_RAY },
	{ angle: 270, d: AXIS_RAY },
	{ angle: 315, d: DIAGONAL_RAY },
];

export function ClaudeGlyph() {
	return (
		<svg
			viewBox="-12 -12 24 24"
			className="size-3.5 shrink-0 fill-outline-strong"
			aria-label="Claude"
			role="img"
		>
			{RAYS.map((ray) => (
				<path key={ray.angle} transform={`rotate(${ray.angle})`} d={ray.d} />
			))}
		</svg>
	);
}
