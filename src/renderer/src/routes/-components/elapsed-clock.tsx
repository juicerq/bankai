import { elapsedLabel } from "@renderer/routes/-utils/elapsed";
import { SECOND_MS, useClock } from "@renderer/routes/-utils/use-clock";

export function ElapsedClock({ since }: { since: number }) {
	const now = useClock(SECOND_MS);

	return (
		<span data-slot="session-elapsed" className="shrink-0 text-outline-strong">
			{elapsedLabel(now - since)}
		</span>
	);
}
