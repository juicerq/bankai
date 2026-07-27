import { MinusIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import type { useFocusTopBand } from "@renderer/routes/-utils/use-focus-top-band";

export function WindowControls({
	fullscreen,
	topBand,
}: {
	fullscreen: boolean;
	topBand: ReturnType<typeof useFocusTopBand>;
}) {
	const { band, registerBand } = topBand;

	return (
		<div
			ref={registerBand}
			inert={fullscreen && !band.revealed}
			data-revealed={fullscreen ? band.revealed : true}
			style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
			onFocusCapture={band.onFocus}
			onBlurCapture={band.onBlur}
			className={`absolute top-0 right-0 z-40 flex h-header border-outline border-b [-webkit-app-region:no-drag] ${
				fullscreen
					? `transition-[transform,opacity] ease-out motion-reduce:transition-none ${
						band.revealed
							? "translate-y-0 opacity-100 shadow-[0_4px_16px_rgba(0,0,0,0.32)]"
							: "pointer-events-none -translate-y-full opacity-0"
					}`
					: ""
			}`}
			aria-label="Window controls"
		>
			<button
				type="button"
				className="flex h-full w-header items-center justify-center text-secondary hover:bg-surface-hover hover:text-primary"
				aria-label="Minimize window"
				onClick={() => window.bankaiWindow.minimize()}
			>
				<MinusIcon className="size-4" />
			</button>
			<button
				type="button"
				className="flex h-full w-header items-center justify-center text-secondary hover:bg-surface-hover hover:text-primary"
				aria-label="Maximize window"
				onClick={() => window.bankaiWindow.toggleMaximize()}
			>
				<StopIcon className="size-3.5" />
			</button>
			<button
				type="button"
				className="flex h-full w-header items-center justify-center text-secondary hover:bg-removed hover:text-primary"
				aria-label="Close window"
				onClick={() => window.bankaiWindow.close()}
			>
				<XMarkIcon className="size-4" />
			</button>
		</div>
	);
}
