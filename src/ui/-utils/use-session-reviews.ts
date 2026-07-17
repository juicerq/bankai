import { useEffect, useState, useSyncExternalStore } from "react";
import { SessionReviews } from "@core/session/SessionReviews";
import type { TabCapture } from "@core/session/TabSessionMonitor";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import type { RestoreReview } from "@core/workspace/restoreWorkspace";

export function useSessionReviews(
	supervisor: TabSupervisor,
	initialReview: RestoreReview | null,
	initialCaptures: Record<string, TabCapture>,
) {
	const [reviews] = useState(() => new SessionReviews(
		supervisor,
		initialCaptures,
		initialReview,
	));
	const snapshot = useSyncExternalStore(reviews.subscribe, reviews.snapshot);

	useEffect(() => {
		return reviews.start();
	}, [reviews]);

	return { reviews, snapshot };
}
