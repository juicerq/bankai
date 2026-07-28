import { useCallback, useRef, useState } from "react";
import type { MobileAccess } from "@main/tailscale/access";
import { PairingQr } from "@renderer/routes/-components/pairing-qr";
import { Setting } from "@renderer/routes/-components/settings-controls";
import { useMobileAccess } from "@renderer/routes/-utils/use-mobile-access";

const NO_TAILSCALE_NOTICE =
	"Tailscale is not reporting a MagicDNS name for this machine. Start Tailscale, then reopen Settings.";

function pairingLink(access: MobileAccess): string | undefined {
	if (access.tailnetOpen && !access.exposed) {
		return access.tailnetUrl;
	}

	return access.url;
}

export function MobileAccessSetting() {
	const { access, failed, working, setExposed, setTailnetOpen, regenerateToken } = useMobileAccess();
	const pairing = access && pairingLink(access);

	return (
		<Setting
			title="Mobile access"
			description="Serves Bankai to your phone through Tailscale on port 443. Nothing is published beyond your tailnet."
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
			{pairing && <Pairing url={pairing} onRegenerate={regenerateToken} />}
			{access?.problem && (
				<span data-slot="mobile-access-problem" className="mt-3 block text-data text-removed">
					{access.problem}
				</span>
			)}
			{access && (
				<TailnetAccess
					access={access}
					onToggle={(open) => {
						if (working) {
							return;
						}

						setTailnetOpen(open);
					}}
				/>
			)}
			{failed && (
				<span data-slot="mobile-access-failed" className="mt-3 block text-data text-removed">
					Could not change mobile access — nothing moved.
				</span>
			)}
		</Setting>
	);
}

function TailnetAccess({
	access,
	onToggle,
}: {
	access: MobileAccess;
	onToggle: (open: boolean) => void;
}) {
	if (!access.tailnetUrl || (!access.tailnetOpen && !access.problem)) {
		return null;
	}

	return (
		<div data-slot="tailnet-access" className="mt-3 flex flex-col items-start gap-2">
			<span className="text-label text-tertiary">WITHOUT HTTPS</span>
			<span className="text-data text-secondary">
				{access.tailnetOpen
					? `Reachable at ${new URL(access.tailnetUrl).origin} inside your tailnet.`
					: "Reaches the phone with no certificate, over the tailnet address."}{" "}
				Notifications only arrive there while Bankai is open on the phone.
			</span>
			<button
				type="button"
				data-slot="toggle-tailnet"
				className="border border-outline-strong px-2 py-1 text-label text-tertiary hover:bg-surface-hover"
				onClick={() => onToggle(!access.tailnetOpen)}
			>
				{access.tailnetOpen ? "CLOSE" : "OPEN ANYWAY"}
			</button>
		</div>
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
