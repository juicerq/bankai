import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { problemText } from "@renderer/routes/-features/app/status/problem-text";

const takeFocus = (element: HTMLButtonElement | null) => element?.focus();

export function CrashScreen({ error }: ErrorComponentProps) {
	return (
		<div
			data-component="crash-screen"
			role="alert"
			className="fixed inset-0 z-100 flex items-center justify-center bg-surface-sunken p-4"
		>
			<div className="flex w-[340px] max-w-full flex-col border border-outline-strong bg-surface-raised shadow-2xl">
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
					<ExclamationTriangleIcon className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
					<span className="flex-1 text-label text-secondary">SOMETHING BROKE</span>
				</div>
				<p className="px-3 pt-4 text-data text-secondary">
					This screen crashed. Reloading brings Bankai back — nothing on the desktop was touched.
				</p>
				<p data-slot="reason" className="break-words px-3 py-3 text-data text-removed">{problemText(error)}</p>
				<div className="flex justify-end border-outline border-t px-3 py-2">
					<button
						type="button"
						data-slot="reload"
						ref={takeFocus}
						className="border border-outline-strong px-3 py-1.5 text-label text-tertiary hover:bg-surface-hover"
						onClick={() => location.reload()}
					>
						Reload
					</button>
				</div>
			</div>
		</div>
	);
}
