import { MinusIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";

export function WindowControls() {
	return (
		<div
			className="absolute top-0 right-0 z-10 flex h-header border-outline border-b [-webkit-app-region:no-drag]"
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
