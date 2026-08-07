import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@renderer/routes/-components/confirm-dialog";
import { useDownloadedUpdate } from "@renderer/routes/-utils/use-downloaded-update";
import { WINDOW_NO_DRAG_CLASS } from "@renderer/routes/-utils/window-drag";
import type { UpdateWorkload } from "@shared/update";

function losses({ kind, count }: UpdateWorkload) {
	if (kind === "agents") {
		return `stops ${count} ${count === 1 ? "agent" : "agents"} mid-turn`;
	}

	return `closes ${count} open ${count === 1 ? "shell" : "shells"}`;
}

export function UpdateButton() {
	const update = useDownloadedUpdate();
	const [confirming, setConfirming] = useState<UpdateWorkload>();
	const cancel = useCallback(() => setConfirming(undefined), []);

	if (!update) {
		return null;
	}

	const requestInstall = async () => {
		const workload = await window.bankaiUpdate.countActiveWork()
			.catch((err) => {
				console.error("Failed to count active work", err);
				return null;
			});

		if (workload === null) {
			return;
		}

		if (!workload.count) {
			window.bankaiUpdate.install();
			return;
		}

		setConfirming(workload);
	};

	return (
		<>
			<button
				type="button"
				data-component="update-button"
				data-version={update.version}
				className={`update-button-enter flex h-full shrink-0 items-center gap-1.5 border-outline border-l px-3 text-label text-tertiary hover:bg-surface-hover ${WINDOW_NO_DRAG_CLASS}`}
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
					Installing v{update.version} {losses(confirming)} and restarts Bankai.
				</ConfirmDialog>
			)}
		</>
	);
}
