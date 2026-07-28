import { QrCodeIcon } from "@heroicons/react/24/outline";
import { useSyncExternalStore } from "react";
import { streamStatus } from "@renderer/lib/stream/status";

export function PairingScreen() {
	const status = useSyncExternalStore(streamStatus.subscribe, streamStatus.get);

	if (status !== "unpaired") {
		return null;
	}

	return (
		<div
			data-component="pairing-screen"
			role="dialog"
			aria-modal="true"
			aria-label="Pair this device"
			className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-6 bg-surface px-8"
		>
			<div className="flex size-20 items-center justify-center border-2 border-tertiary">
				<QrCodeIcon className="size-10 text-tertiary" aria-hidden="true" />
			</div>
			<span className="text-label text-secondary">NOT PAIRED</span>
			<p data-slot="message" className="max-w-[280px] text-center text-body text-primary">
				Scan the QR in the desktop settings.
			</p>
			<p className="max-w-[280px] text-center text-data text-secondary">
				Bankai on your desktop hands this device its key. Nothing to type here.
			</p>
		</div>
	);
}
