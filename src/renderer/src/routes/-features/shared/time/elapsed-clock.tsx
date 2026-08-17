import { elapsedLabel } from "@renderer/routes/-features/shared/time/elapsed";
import { SECOND_MS, useClock } from "@renderer/routes/-features/shared/time/use-clock";

export function ElapsedClock({
	since,
	slot = "session-elapsed",
	className = "text-outline-strong",
}: {
	since: number;
	slot?: string;
	className?: string;
}) {
	const now = useClock(SECOND_MS);

	return (
		<span data-slot={slot} className={`shrink-0 ${className}`}>
			{elapsedLabel(now - since)}
		</span>
	);
}
