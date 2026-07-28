import { useCallback, useState } from "react";

interface QrDetector {
	detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

declare global {
	interface Window {
		BarcodeDetector?: new (options: { formats: string[] }) => QrDetector;
	}
}

const SCAN_INTERVAL_MS = 250;

export function qrScanAvailable(): boolean {
	return !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;
}

export function PairingScanner({
	onScanned,
	onCancel,
}: {
	onScanned: (scanned: string) => boolean;
	onCancel: () => void;
}) {
	const [problem, setProblem] = useState<string>();

	// The camera and the barcode reader are imperative: they can only be opened once
	// the video element exists, and the stream has to be released when it leaves.
	const viewfinder = useCallback((element: HTMLVideoElement | null) => {
		if (!element || !window.BarcodeDetector) {
			return;
		}

		const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
		let stream: MediaStream | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		const read = async () => {
			const found = await detector.detect(element).catch(() => []);
			const scanned = found[0]?.rawValue;

			if (stopped || (scanned && onScanned(scanned))) {
				return;
			}

			timer = setTimeout(() => void read(), SCAN_INTERVAL_MS);
		};

		const open = async () => {
			const opened = await navigator.mediaDevices
				.getUserMedia({ video: { facingMode: "environment" } })
				.catch(() => {});

			if (!opened) {
				setProblem("Bankai could not open the camera. Allow it and try again.");

				return;
			}

			stream = opened;

			if (stopped) {
				opened.getTracks().forEach((track) => track.stop());

				return;
			}

			element.srcObject = opened;
			void element.play();
			await read();
		};

		void open();

		return () => {
			stopped = true;
			clearTimeout(timer);

			for (const track of stream?.getTracks() ?? []) {
				track.stop();
			}
		};
	}, [onScanned]);

	return (
		<>
			<header className="flex h-header shrink-0 items-center justify-between border-outline border-b px-4">
				<span className="text-label text-secondary">PAIR THIS DEVICE</span>
				<button
					type="button"
					data-slot="cancel"
					className="-mr-2 px-2 py-2 text-label text-secondary active:text-primary"
					onClick={onCancel}
				>
					CANCEL
				</button>
			</header>
			<div data-slot="viewfinder" className="relative min-h-0 flex-1 bg-surface-sunken">
				{/** biome-ignore lint/a11y/useMediaCaption: a camera preview carries no audio to caption */}
				<video ref={viewfinder} muted playsInline className="absolute inset-0 size-full object-cover" />
				<span
					aria-hidden="true"
					className="-translate-y-1/2 absolute inset-x-6 top-1/2 aspect-square border-2 border-tertiary"
				/>
			</div>
			<p className="shrink-0 py-4 text-center text-label text-secondary">POINT AT THE DESKTOP QR</p>
			{problem && (
				<p data-slot="problem" className="shrink-0 px-6 pb-6 text-center text-data text-removed">{problem}</p>
			)}
		</>
	);
}
