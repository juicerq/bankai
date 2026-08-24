import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@renderer/routes/-features/shared/interaction/confirm-dialog";
import { useDownloadedUpdate } from "@renderer/routes/-features/app/update/use-downloaded-update";
import { workloadLosses } from "@renderer/routes/-features/app/daemon/workload-losses";
import { HEADER_NOTICE_CLASS } from "@renderer/routes/-features/app/chrome/header-notice";
import type { UpdateWorkload } from "@shared/update";

export function UpdateButton() {
	const update = useDownloadedUpdate();
	const [confirming, setConfirming] = useState<UpdateWorkload>();
	const cancel = useCallback(() => setConfirming(undefined), []);

	if (!update) {
		return null;
	}

	const requestInstall = () => {
		window.bankaiUpdate.installCost()
			.then((cost) => {
				if (!cost?.count) {
					window.bankaiUpdate.install();
					return;
				}

				setConfirming(cost);
			})
			.catch((err) => console.error("Failed to read what the update costs", err));
	};

	return (
		<>
			<button
				type="button"
				data-component="update-button"
				data-version={update.version}
				className={HEADER_NOTICE_CLASS}
				aria-label={`Update to v${update.version}`}
				title={`Update to v${update.version} — restarts Bankai`}
				onClick={requestInstall}
			>
				<ArrowPathIcon className="size-3.5 shrink-0" aria-hidden="true" />
				<span data-slot="update-version">v{update.version}</span>
			</button>
			{confirming !== undefined && (
				<ConfirmDialog
					component="update-confirm"
					title="INSTALL UPDATE"
					label={`Install v${update.version}`}
					action="INSTALL"
					onCancel={cancel}
					onConfirm={() => {
						cancel();
						window.bankaiUpdate.install();
					}}
				>
					Installing v{update.version} {workloadLosses(confirming)} and restarts Bankai.
				</ConfirmDialog>
			)}
		</>
	);
}
