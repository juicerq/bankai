import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { useDownloadedUpdate } from "@renderer/routes/-utils/use-downloaded-update";

export function UpdateNotification() {
	const update = useDownloadedUpdate();
	const [dismissedVersion, setDismissedVersion] = useState<string>();

	if (!update || update.version === dismissedVersion) {
		return null;
	}

	return (
		<div
			data-component="update-notification"
			data-version={update.version}
			className="update-toast-enter fixed right-4 bottom-4 z-50 flex items-center gap-3 border border-outline bg-surface-raised py-2 pr-2 pl-3"
		>
			<span className="size-[6px] shrink-0 rounded-full bg-tertiary" />
			<div className="flex flex-col leading-tight">
				<span className="text-label text-tertiary">UPDATE READY</span>
				<span className="text-secondary text-support">v{update.version}</span>
			</div>
			<button
				type="button"
				data-slot="restart"
				className="ml-1 flex items-center gap-1.5 bg-primary px-2.5 py-1.5 text-label text-surface hover:bg-secondary"
				onClick={() => window.bankaiUpdate.install()}
			>
				<ArrowPathIcon className="size-3" />
				RESTART
			</button>
			<button
				type="button"
				data-slot="dismiss"
				aria-label="Dismiss update notification"
				className="flex size-6 items-center justify-center text-secondary hover:text-primary"
				onClick={() => setDismissedVersion(update.version)}
			>
				<XMarkIcon className="size-4" />
			</button>
		</div>
	);
}
