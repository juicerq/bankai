import { ArrowPathIcon, SignalSlashIcon } from "@heroicons/react/24/outline";
import { useSyncExternalStore } from "react";
import { streamSocket } from "@renderer/lib/stream/socket";
import { streamStatus } from "@renderer/lib/stream/status";

const BLOCKING_STATUSES = {
	reconnecting: {
		icon: SignalSlashIcon,
		label: "DISCONNECTED",
		message: "Lost the connection to Bankai. Trying again on its own.",
		action: "Retry now",
		slot: "retry",
		act: streamSocket.retry,
	},
	outdated: {
		icon: ArrowPathIcon,
		label: "NEW VERSION",
		message: "Bankai was updated while this window was open. Restart to load it.",
		action: "Restart",
		slot: "restart",
		act: location.reload.bind(location),
	},
} as const;

const takeFocus = (element: HTMLButtonElement | null) => element?.focus();

export function StreamOverlay() {
	const status = useSyncExternalStore(streamStatus.subscribe, streamStatus.get);

	if (status !== "reconnecting" && status !== "outdated") {
		return null;
	}

	const { icon: Icon, label, message, action, slot, act } = BLOCKING_STATUSES[status];

	return (
		<div
			data-component="stream-overlay"
			data-status={status}
			role="dialog"
			aria-modal="true"
			aria-label={label}
			className="picker-backdrop fixed inset-0 z-100 flex items-center justify-center bg-surface-sunken/85"
		>
			<div className="picker-enter flex w-[340px] max-w-[80vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl">
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
					<Icon className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
					<span className="flex-1 text-label text-secondary">{label}</span>
					{status === "reconnecting" && <span className="pending-pulse size-1.5 bg-tertiary" aria-hidden="true" />}
				</div>
				<p data-slot="message" className="px-3 py-4 text-data text-secondary">{message}</p>
				<div className="flex justify-end border-outline border-t px-3 py-2">
					<button
						type="button"
						data-slot={slot}
						ref={takeFocus}
						className="border border-outline-strong px-3 py-1.5 text-label text-tertiary hover:bg-surface-hover"
						onClick={act}
					>
						{action}
					</button>
				</div>
			</div>
		</div>
	);
}
