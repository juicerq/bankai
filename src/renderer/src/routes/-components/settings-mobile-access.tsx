import { useCallback, useRef, useState } from "react";
import { PairingQr } from "@renderer/routes/-components/pairing-qr";
import { Setting } from "@renderer/routes/-components/settings-controls";
import { useMobileAccess } from "@renderer/routes/-utils/use-mobile-access";

const NO_TAILSCALE_NOTICE =
	"Tailscale is not reporting a MagicDNS name for this machine. Start Tailscale, then reopen Settings.";

export function MobileAccessSetting() {
	const { access, failed, working, setExposed, regenerateToken } = useMobileAccess();

	return (
		<Setting
			title="Mobile access"
			description="Serves Bankai to your phone through Tailscale on port 443. The listener itself never leaves this machine."
			slot="mobile-access"
			on={!!access?.exposed}
			onToggle={() => {
				if (working) {
					return;
				}

				setExposed(!access?.exposed);
			}}
		>
			{!access && <span className="block text-data text-secondary">Asking Tailscale…</span>}
			{access && !access.url && (
				<span data-slot="no-tailscale" className="block text-data text-secondary">{NO_TAILSCALE_NOTICE}</span>
			)}
			{access?.url && <Pairing url={access.url} onRegenerate={regenerateToken} />}
			{access?.problem && (
				<span data-slot="mobile-access-problem" className="mt-3 block text-data text-removed">
					{access.problem}
				</span>
			)}
			{failed && (
				<span data-slot="mobile-access-failed" className="mt-3 block text-data text-removed">
					Could not reach Tailscale — nothing changed.
				</span>
			)}
		</Setting>
	);
}

function Pairing({ url, onRegenerate }: { url: string; onRegenerate: () => void }) {
	const [enlarged, setEnlarged] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const close = () => {
		setEnlarged(false);
		trigger.current?.focus();
	};

	return (
		<div className="flex items-start gap-3">
			<button
				type="button"
				data-slot="enlarge-qr"
				ref={trigger}
				aria-haspopup="dialog"
				className="group flex shrink-0 flex-col items-center gap-1.5"
				onClick={() => setEnlarged(true)}
			>
				<PairingQr url={url} className="size-[104px] border border-outline-strong group-hover:border-tertiary" />
				<span className="text-label text-tertiary group-hover:text-secondary">ENLARGE</span>
			</button>
			{enlarged && <EnlargedQr url={url} onClose={close} />}
			<div className="flex min-w-0 flex-1 flex-col items-start gap-2">
				<span className="block text-label text-secondary">PAIRING LINK</span>
				<span data-slot="pairing-url" className="block select-all break-all text-data text-primary">{url}</span>
				<button
					type="button"
					data-slot="regenerate-token"
					className="border border-outline-strong px-2 py-1 text-label text-tertiary hover:bg-surface-hover"
					onClick={onRegenerate}
				>
					REGENERATE
				</button>
				<span className="block text-data text-secondary">
					A new token drops every paired phone back to the pairing screen.
				</span>
			</div>
		</div>
	);
}

function EnlargedQr({ url, onClose }: { url: string; onClose: () => void }) {
	const takeFocus = useCallback((element: HTMLDivElement | null) => element?.focus(), []);

	return (
		<div
			data-slot="enlarged-qr"
			role="dialog"
			aria-modal="true"
			aria-label="Pairing QR code"
			tabIndex={-1}
			ref={takeFocus}
			className="picker-backdrop fixed inset-0 z-50 flex items-center justify-center bg-surface-sunken/90 outline-none"
			onPointerDown={(event) => {
				event.stopPropagation();
				onClose();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					onClose();
				}
			}}
		>
			<PairingQr url={url} className="size-[min(82vw,82vh)] border border-outline-strong" />
		</div>
	);
}
