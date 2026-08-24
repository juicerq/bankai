import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@renderer/routes/-features/shared/interaction/confirm-dialog";
import { workloadLosses } from "@renderer/routes/-features/app/daemon/workload-losses";
import { HEADER_NOTICE_CLASS } from "@renderer/routes/-features/app/chrome/header-notice";
import type { UpdateWorkload } from "@shared/update";

type RestartCost = UpdateWorkload | "unknown";

function restartCore() {
	window.bankaiDaemon.restart()
		.then(() => location.reload())
		.catch((err) => console.error("Failed to restart the core", err));
}

function restartLosses(cost: RestartCost): string {
	if (cost === "unknown") {
		return "stops whatever the core is running";
	}

	return workloadLosses(cost);
}

export function DaemonSkewButton() {
	const { data: skew } = useQuery({
		queryKey: ["daemon-skew"],
		queryFn: () => window.bankaiDaemon.getSkew(),
	});
	const [confirming, setConfirming] = useState<RestartCost>();
	const cancel = useCallback(() => setConfirming(undefined), []);

	if (!skew) {
		return null;
	}

	const requestRestart = () => {
		window.bankaiDaemon.countActiveWork()
			.then((workload) => {
				if (!workload.count) {
					restartCore();
					return;
				}

				setConfirming(workload);
			})
			.catch((err) => {
				console.error("Failed to count active work", err);
				setConfirming("unknown");
			});
	};

	return (
		<>
			<button
				type="button"
				data-component="daemon-skew-button"
				data-version={skew.daemonVersion}
				className={HEADER_NOTICE_CLASS}
				aria-label={`Restart the core running v${skew.daemonVersion}`}
				title={`Bankai's core still runs v${skew.daemonVersion} — restart it to load v${skew.appVersion}`}
				onClick={requestRestart}
			>
				<ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
				<span data-slot="daemon-skew-version">CORE v{skew.daemonVersion}</span>
			</button>
			{confirming !== undefined && (
				<ConfirmDialog
					component="daemon-restart-confirm"
					title="RESTART CORE"
					label="Restart the core"
					action="RESTART"
					onCancel={cancel}
					onConfirm={() => {
						cancel();
						restartCore();
					}}
				>
					Restarting the core {restartLosses(confirming)} and loads v{skew.appVersion}.
				</ConfirmDialog>
			)}
		</>
	);
}
