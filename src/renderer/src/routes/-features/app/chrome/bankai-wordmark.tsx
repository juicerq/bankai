import { WINDOW_DRAG_CLASS } from "@renderer/routes/-features/app/chrome/window-drag";

export function BankaiWordmark() {
	return (
		<h1
			className={`m-0 flex h-header shrink-0 items-center justify-between border-b border-outline px-3 text-label ${WINDOW_DRAG_CLASS}`}
		>
			<span className="relative isolate flex items-center justify-center">
				<svg
					viewBox="268 88 488 854"
					className="absolute top-1/2 left-1/2 z-0 h-5 w-auto -translate-x-1/2 -translate-y-1/2 fill-tertiary"
					aria-hidden="true"
				>
					<path d="M512 88 C556 88 588 106 606 142 C596 184 558 200 546 248 L554 396 L724 396 C742 392 756 406 756 427 C756 448 742 462 724 458 L598 458 C572 622 542 784 512 942 C482 784 452 622 426 458 L300 458 C282 462 268 448 268 427 C268 406 282 392 300 396 L470 396 L478 248 C466 200 428 184 418 142 C436 106 468 88 512 88 Z" />
				</svg>
				<span className="relative z-10">BANKAI</span>
			</span>
			{import.meta.env.DEV && (
				<span className="border border-outline-strong px-1.5 py-0.5 text-secondary">DEV</span>
			)}
		</h1>
	);
}
