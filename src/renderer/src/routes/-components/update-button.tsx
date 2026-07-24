import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useDownloadedUpdate } from "@renderer/routes/-utils/use-downloaded-update";

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
			className="update-button-enter flex h-full w-header shrink-0 items-center justify-center border-outline border-l text-tertiary hover:bg-surface-hover"
			aria-label={`Update to v${update.version}`}
			title={`Update to v${update.version} — restarts Bankai`}
			onClick={() => window.bankaiUpdate.install()}
		>
			<ArrowPathIcon className="size-4" />
		</button>
	);
}
