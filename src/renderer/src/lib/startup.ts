import { client } from "@renderer/lib/api";
import type { QueryClient } from "@tanstack/react-query";

const REPORT_TIMEOUT_MS = 5000;

const marks: { stage: string; at: number }[] = [];

export function markStartup(stage: string): void {
	marks.push({ stage, at: Date.now() });
}

export function installStartupTiming({ queryClient }: { queryClient: QueryClient }): void {
	const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
		if (event.type !== "updated") {
			return;
		}

		if (event.action.type === "fetch") {
			markStartup(`fetch ${event.query.queryHash}`);
		}

		if (event.action.type === "success" || event.action.type === "error") {
			markStartup(`${event.action.type} ${event.query.queryHash}`);
		}
	});

	requestAnimationFrame(() => {
		markStartup("first-frame");
		requestIdleCallback(
			() => {
				unsubscribe();
				client.logger.startup({ marks: [...marks] }).catch(() => {});
				marks.length = 0;
			},
			{ timeout: REPORT_TIMEOUT_MS },
		);
	});
}
