import { useCallback, useRef, useState } from "react";
import type { MobileAccessStatus } from "@main/infra/tailscale/tailscale-access";
import { PairingQr } from "@renderer/routes/-components/pairing-qr";
import { Setting } from "@renderer/routes/-components/settings-controls";
import { useMobileAccess } from "@renderer/routes/-utils/use-mobile-access";

const NO_TAILSCALE_NOTICE =
	"Tailscale is not reporting a MagicDNS name for this machine. Start Tailscale, then reopen Settings.";

function pairingLink(access: MobileAccessStatus): string | undefined {
	if (access.tailnetOpen && !access.exposed) {
		return access.tailnetUrl;
	}

	return access.url;
}

const TAILNET_NOTICE =
	"This tailnet issues no HTTPS certificates, so the phone gets plain HTTP on the tailnet address. Notifications only arrive there while Bankai is open on the phone, and it cannot be installed to the home screen. Enable HTTPS Certificates at login.tailscale.com/admin/dns to get the full surface back.";

export function MobileAccessSetting() {
	const { access, failed, working, setExposed, regenerateToken } = useMobileAccess();
	const pairing = access && pairingLink(access);
	const reachable = !!(access?.exposed || access?.tailnetOpen);

	return (
		<Setting
			title="Mobile access"
			description="Serves Bankai to your phone through Tailscale. Nothing is published beyond your tailnet."
			slot="mobile-access"
			on={reachable}
			onToggle={() => {
				if (working) {
					return;
				}

				setExposed(!reachable);
			}}
		>
			{!access && <span className="block text-data text-secondary">Asking Tailscale…</span>}
			{access && !access.url && (
				<span data-slot="no-tailscale" className="block text-data text-secondary">{NO_TAILSCALE_NOTICE}</span>
			)}
			{pairing && <Pairing url={pairing} reachable={reachable} onRegenerate={regenerateToken} />}
			{access?.tailnetOpen && (
				<span data-slot="tailnet-notice" className="mt-3 block text-data text-secondary">{TAILNET_NOTICE}</span>
			)}
			{access?.problem && (
				<span data-slot="mobile-access-problem" className="mt-3 block text-data text-removed">
					{access.problem}
				</span>
			)}
			{failed && (
				<span data-slot="mobile-access-failed" className="mt-3 block text-data text-removed">
					Could not change mobile access — nothing moved.
				</span>
			)}
		</Setting>
	);
}

function Pairing({
	url,
	reachable,
	onRegenerate,
}: {
	url: string;
	reachable: boolean;
	onRegenerate: () => void;
}) {
	const [enlarged, setEnlarged] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const close = () => {
		setEnlarged(false);
		trigger.current?.focus();
	};

	return (
		<div className={`flex items-start gap-3 ${reachable ? "" : "opacity-40"}`}>
			<button
				type="button"
				data-slot="enlarge-qr"
				ref={trigger}
				aria-haspopup="dialog"
				disabled={!reachable}
				className={`flex shrink-0 flex-col items-center gap-1.5 ${reachable ? "group" : ""}`}
				onClick={() => setEnlarged(true)}
			>
				<PairingQr url={url} className="size-[104px] border border-outline-strong group-hover:border-tertiary" />
				<span className="text-label text-secondary group-hover:text-tertiary">ENLARGE</span>
			</button>
			{enlarged && <EnlargedQr url={url} onClose={close} />}
			<div className="flex min-w-0 flex-1 flex-col items-start gap-2">
				<span className="block text-label text-secondary">PAIRING LINK</span>
				<span data-slot="pairing-url" className="block select-all break-all text-data text-primary">{url}</span>
				<button
					type="button"
					data-slot="regenerate-token"
					disabled={!reachable}
					className="border border-outline-strong px-2 py-1 text-label text-secondary enabled:hover:border-tertiary enabled:hover:text-tertiary"
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
