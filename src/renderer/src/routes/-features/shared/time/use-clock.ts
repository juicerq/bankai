import { useMemo, useSyncExternalStore } from "react";

export const SECOND_MS = 1000;

export function useClock(intervalMs: number): number {
	const [subscribe, getSnapshot] = useMemo(
		() => [
			(notify: () => void) => {
				const ticking = setInterval(notify, intervalMs);

				return () => clearInterval(ticking);
			},
			() => Math.floor(Date.now() / intervalMs) * intervalMs,
		],
		[intervalMs],
	);

	return useSyncExternalStore(subscribe, getSnapshot);
}
