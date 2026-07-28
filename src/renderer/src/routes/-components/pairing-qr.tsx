import { useMemo } from "react";
import { encode } from "uqr";

const QR_BORDER_MODULES = 2;

export function PairingQr({ url, className }: { url: string; className?: string }) {
	const { size, path } = useMemo(() => {
		const code = encode(url, { border: QR_BORDER_MODULES, ecc: "M" });
		const path = code.data
			.flatMap((row, y) => row.map((filled, x) => (filled ? `M${x} ${y}h1v1h-1z` : undefined)))
			.filter((module) => !!module)
			.join("");

		return { size: code.size, path };
	}, [url]);

	return (
		<svg
			data-slot="pairing-qr"
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label="Pairing QR code"
			className={className}
			shapeRendering="crispEdges"
		>
			<rect width={size} height={size} className="fill-primary" />
			<path d={path} className="fill-surface-sunken" />
		</svg>
	);
}
