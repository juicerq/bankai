import { QrCodeIcon } from "@heroicons/react/24/outline";
import { useCallback, useState, useSyncExternalStore } from "react";
import { acceptPairingOffer } from "@renderer/lib/pairing";
import { streamStatus } from "@renderer/lib/stream/status";
import { PairingScanner, qrScanAvailable } from "@renderer/routes/-features/settings/pairing-scanner";

export function PairingScreen() {
	const status = useSyncExternalStore(streamStatus.subscribe, streamStatus.get);
	const [scanning, setScanning] = useState(false);
	const [refused, setRefused] = useState(false);
	const scanned = useCallback((offered: string) => {
		const accepted = acceptPairingOffer(offered);
		setRefused(!accepted);

		return accepted;
	}, []);

	if (status !== "unpaired") {
		return null;
	}

	return (
		<div
			data-component="pairing-screen"
			role="dialog"
			aria-modal="true"
			aria-label="Pair this device"
			className="fixed inset-0 z-100 flex flex-col bg-surface"
		>
			{scanning
				? <PairingScanner onScanned={scanned} onCancel={() => setScanning(false)} />
				: (
					<div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
						<div className="flex size-20 items-center justify-center border-2 border-tertiary">
							<QrCodeIcon className="size-10 text-tertiary" aria-hidden="true" />
						</div>
						<span className="text-label text-secondary">NOT PAIRED</span>
						<p data-slot="message" className="max-w-72 text-center text-body text-primary">
							Scan the QR in the desktop settings.
						</p>
						{qrScanAvailable()
							? (
								<button
									type="button"
									data-slot="scan"
									className="bg-primary px-4 py-3 text-label text-surface active:bg-secondary"
									onClick={() => {
										setRefused(false);
										setScanning(true);
									}}
								>
									SCAN THE QR
								</button>
							)
							: (
								<p className="max-w-72 text-center text-data text-secondary">
									Bankai on your desktop hands this device its key. Nothing to type here.
								</p>
							)}
					</div>
				)}
			{refused && (
				<p data-slot="refused" className="shrink-0 px-6 pb-6 text-center text-data text-removed">
					That code is not a Bankai key.
				</p>
			)}
		</div>
	);
}
