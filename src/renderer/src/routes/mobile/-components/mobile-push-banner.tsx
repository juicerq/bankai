import { useState } from "react";
import {
	enablePushNotifications,
	pushBlockedByOrigin,
	type PushPermission,
	pushPermission,
} from "@renderer/lib/push";
import { problemText } from "@renderer/routes/-utils/problem-text";

export function MobilePushBanner() {
	const [permission, setPermission] = useState<PushPermission>(pushPermission);
	const [problem, setProblem] = useState<string>();

	if (pushBlockedByOrigin()) {
		return (
			<div data-component="mobile-push-banner" className="shrink-0 border-b border-outline">
				<p data-slot="insecure" className="px-4 py-2.5 text-secondary text-support">
					No notifications on this address — it has no certificate. Open Bankai through the Tailscale HTTPS
					address to get them.
				</p>
			</div>
		);
	}

	if (permission !== "default") {
		return null;
	}

	return (
		<div data-component="mobile-push-banner" className="shrink-0 border-b border-outline">
			<button
				type="button"
				data-slot="enable"
				className="flex w-full items-center gap-2 px-4 py-2.5 text-left active:bg-surface-active"
				onClick={async () => {
					setProblem(undefined);
					try {
						setPermission(await enablePushNotifications());
					} catch (err) {
						setProblem(problemText(err));
					}
				}}
			>
				<span aria-hidden="true" className="text-tertiary text-data">❯</span>
				<span className="flex-1 text-body text-secondary">Enable notifications</span>
				<span className="text-label text-tertiary">TAP</span>
			</button>
			{problem && <p data-slot="problem" className="px-4 pb-2 text-removed text-support">{problem}</p>}
		</div>
	);
}
