import { MinusIcon, Square2StackIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useSyncExternalStore } from "react";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import type { useFocusTopBand } from "@renderer/routes/-utils/use-focus-top-band";
import { WINDOW_NO_DRAG_CLASS } from "@renderer/routes/-utils/window-drag";

function subscribeMaximized(listener: () => void) {
	return window.bankaiWindow?.onMaximizedChange(listener) ?? (() => {});
}

function readMaximized() {
	return window.bankaiWindow?.isMaximized() ?? false;
}

export function WindowControls({
	fullscreen,
	topBand,
}: {
	fullscreen: boolean;
	topBand: ReturnType<typeof useFocusTopBand>;
}) {
	const { band, registerBand } = topBand;
	const maximized = useSyncExternalStore(subscribeMaximized, readMaximized);

	return (
		<div
			ref={registerBand}
			data-component="window-controls"
			inert={fullscreen && !band.revealed}
			data-revealed={fullscreen ? band.revealed : true}
			style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
			onFocusCapture={band.onFocus}
			onBlurCapture={band.onBlur}
			className={`absolute top-0 right-0 z-40 flex h-header border-outline border-b ${WINDOW_NO_DRAG_CLASS} ${
				fullscreen
					? `transition-[transform,opacity] ease-out motion-reduce:transition-none ${
						band.revealed
							? "translate-y-0 opacity-100 shadow-[0_4px_16px_var(--color-shadow)]"
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
				onClick={() => window.bankaiWindow?.minimize()}
			>
				<MinusIcon className="size-4" />
			</button>
			<button
				type="button"
				className="flex h-full w-header items-center justify-center text-secondary hover:bg-surface-hover hover:text-primary"
				data-slot="toggle-maximize"
				aria-label={maximized ? "Restore window" : "Maximize window"}
				onClick={() => window.bankaiWindow?.toggleMaximize()}
			>
				{maximized ? <Square2StackIcon className="size-3.5" /> : <StopIcon className="size-3.5" />}
			</button>
			<button
				type="button"
				className="flex h-full w-header items-center justify-center text-secondary hover:bg-removed hover:text-primary"
				aria-label="Close window"
				onClick={() => window.bankaiWindow?.close()}
			>
				<XMarkIcon className="size-4" />
			</button>
		</div>
	);
}
