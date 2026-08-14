import { useState } from "react";
import { ConfirmDialog } from "@renderer/routes/-features/shared/interaction/confirm-dialog";
import { SettingBlock } from "@renderer/routes/-features/settings/settings-controls";

type ClearState = "idle" | "clearing" | "cleared" | "failed";

export function BrowserDataSetting() {
	const [confirming, setConfirming] = useState(false);
	const [state, setState] = useState<ClearState>("idle");

	const clearData = async () => {
		setConfirming(false);
		setState("clearing");
		const api = window.bankaiSessionPage;

		if (!api) {
			setState("failed");
			return;
		}

		await api.clearData().then(
			() => setState("cleared"),
			() => setState("failed"),
		);
	};

	return (
		<SettingBlock
			title="Browser profile"
			description="Bankai keeps website sign-ins in its own profile on this device."
			control={(
				<button
					type="button"
					data-slot="clear-browser-data"
					disabled={state === "clearing"}
					className="shrink-0 border border-removed px-2 py-1 text-label text-removed hover:bg-removed hover:text-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
					onClick={() => setConfirming(true)}
				>
					{state === "clearing" ? "CLEARING…" : "CLEAR DATA"}
				</button>
			)}
		>
			{state === "cleared" && (
				<span data-slot="browser-data-cleared" className="text-data text-secondary">Browser data cleared.</span>
			)}
			{state === "failed" && (
				<span data-slot="browser-data-error" className="text-data text-removed">Could not clear browser data.</span>
			)}
			{confirming && (
				<ConfirmDialog
					component="clear-browser-data-confirm"
					title="CLEAR BROWSER DATA"
					label="Clear Bankai browser data"
					action="CLEAR"
					danger
					onCancel={() => setConfirming(false)}
					onConfirm={() => void clearData()}
				>
					This will sign out of websites in Bankai and remove their stored data.
				</ConfirmDialog>
			)}
		</SettingBlock>
	);
}
