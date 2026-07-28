import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useDownloadedUpdate } from "@renderer/routes/-utils/use-downloaded-update";
import { WINDOW_NO_DRAG_CLASS } from "@renderer/routes/-utils/window-drag";

export function UpdateButton() {
	const update = useDownloadedUpdate();

	if (!update) {
		return null;
	}

	return (
		<button
			type="button"
			data-component="update-button"
			data-version={update.version}
			className={`update-button-enter flex h-full shrink-0 items-center gap-1.5 border-outline border-l px-3 text-label text-tertiary hover:bg-surface-hover ${WINDOW_NO_DRAG_CLASS}`}
			aria-label={`Update to v${update.version}`}
			title={`Update to v${update.version} — restarts Bankai`}
			onClick={() => window.bankaiUpdate.install()}
		>
			<ArrowPathIcon className="size-3.5 shrink-0" aria-hidden="true" />
			<span data-slot="update-version">v{update.version}</span>
		</button>
	);
}
